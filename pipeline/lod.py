"""Level of detection and volume math, kept separate so it can be unit tested.

Terms, in plain language:

- sigma95: the vertical accuracy a survey states at 95 percent confidence.
  "Half of our check points were within X" is not it; "95 percent were within X" is.
- Level of detection (LoD): how big a change has to be before we believe it.
  Two surveys each have their own error, and errors add in quadrature:
  sqrt(a^2 + b^2). We also measure the real spread on ground that did not
  move and take whichever is larger, so the LoD never understates the noise.
- NMAD: normalized median absolute deviation, 1.4826 times the median of
  |x - median(x)|. A standard deviation that ignores outliers.
"""
from __future__ import annotations

import math

import numpy as np


def level_of_detection(sigma95_before_m: float, sigma95_after_m: float, stable_nmad_m: float | None = None) -> dict:
    stated = math.sqrt(sigma95_before_m ** 2 + sigma95_after_m ** 2)
    empirical = 1.96 * stable_nmad_m if stable_nmad_m is not None else 0.0
    return {
        "lod_m": max(stated, empirical),
        "stated_m": stated,
        "empirical_m": empirical,
        "basis": "stated accuracies in quadrature" if stated >= empirical else "1.96 x NMAD on stable ground",
    }


def volume_totals(diff_m: np.ndarray, cell_area_m2: float, lod_m: float,
                  exclude: np.ndarray | None = None) -> dict:
    """Cut, fill, net, areas and a conservative uncertainty from a difference grid (NaN = no data).

    Only cells whose |change| exceeds lod_m count. Uncertainty per cell is lod_m, summed
    linearly over the counted cells (treats error as systematic, the cautious choice).
    Cells where `exclude` is True (for example open water) are left out entirely.
    """
    d = np.asarray(diff_m, dtype=np.float64)
    valid = np.isfinite(d)
    if exclude is not None:
        valid &= ~np.asarray(exclude, dtype=bool)
    loss = valid & (d < -lod_m)
    gain = valid & (d > lod_m)
    cut = float(-d[loss].sum() * cell_area_m2)
    fill = float(d[gain].sum() * cell_area_m2)
    cut_area = float(loss.sum() * cell_area_m2)
    fill_area = float(gain.sum() * cell_area_m2)
    return {
        "lod_m": lod_m,
        "cut_m3": cut,
        "fill_m3": fill,
        "net_m3": fill - cut,
        "cut_area_m2": cut_area,
        "fill_area_m2": fill_area,
        "area_changed_m2": cut_area + fill_area,
        "cut_uncertainty_m3": cut_area * lod_m,
        "fill_uncertainty_m3": fill_area * lod_m,
        "net_uncertainty_m3": (cut_area + fill_area) * lod_m,
        "cells_counted": int(loss.sum() + gain.sum()),
        "cells_valid": int(valid.sum()),
    }


def block_slope_degrees(dem: np.ndarray, cell_m: float, block: int = 5) -> np.ndarray:
    """Slope of the surface after averaging it over block x block cells, returned at full size."""
    h, w = dem.shape
    ph, pw = (-h) % block, (-w) % block
    padded = np.pad(np.nan_to_num(dem, nan=np.nanmean(dem)), ((0, ph), (0, pw)), mode="edge")
    coarse = padded.reshape(padded.shape[0] // block, block, padded.shape[1] // block, block).mean(axis=(1, 3))
    gy, gx = np.gradient(coarse, cell_m * block)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    return np.repeat(np.repeat(slope, block, axis=0), block, axis=1)[:h, :w]


def find_pool(after_m: np.ndarray, diff_m: np.ndarray, lod_m: float, cell_m: float,
              max_slope_deg: float = 0.3, tolerance_m: float = 0.4, bin_m: float = 0.2,
              mask_max_slope_deg: float = 1.0) -> dict:
    """Detect a lake that formed where ground rose: a flat surface at one elevation.

    Lidar returns from water are sparse, so a vendor's bare-earth grid across a pond is an
    interpolated flat sheet at the water level. Among cells that gained more than the LoD,
    we histogram the after-elevation of the flat ones; a lake shows up as one tall spike.
    Returns the pool elevation and a boolean mask of cells within tolerance of it.
    """
    a = np.asarray(after_m, dtype=np.float64)
    d = np.asarray(diff_m, dtype=np.float64)
    gain = np.isfinite(d) & np.isfinite(a) & (d > lod_m)
    # Slope is measured on a 5-cell block average. Per-cell noise of a few centimeters
    # would otherwise make a flat lake look like it tilts a degree or two.
    slope = block_slope_degrees(a, cell_m, block=5)
    flat = gain & (slope < max_slope_deg)
    if flat.sum() < 100:
        return {"found": False, "pool_elev_m": None, "mask": np.zeros_like(gain)}
    vals = a[flat]
    lo = np.floor(vals.min())
    hist, edges = np.histogram(vals, bins=np.arange(lo, vals.max() + bin_m, bin_m))
    i = int(np.argmax(hist))
    pool = float(edges[i] + bin_m / 2)
    # The mask keeps a looser slope limit than the histogram so lake edges are not clipped,
    # but sloping ground that merely passes through the pool elevation stays out.
    mask = gain & (np.abs(a - pool) < tolerance_m) & (slope < mask_max_slope_deg)
    return {"found": True, "pool_elev_m": pool, "spike_cells": int(hist[i]), "mask": mask}
