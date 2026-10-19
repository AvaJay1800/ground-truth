import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lod import find_pool, level_of_detection, volume_totals  # noqa: E402


def test_lod_combines_in_quadrature():
    r = level_of_detection(0.054, 0.054)
    assert r["lod_m"] == pytest.approx(math.sqrt(2) * 0.054)
    assert r["basis"] == "stated accuracies in quadrature"


def test_lod_uses_empirical_when_noisier():
    r = level_of_detection(0.054, 0.054, stable_nmad_m=0.10)
    assert r["lod_m"] == pytest.approx(1.96 * 0.10)
    assert r["basis"] == "1.96 x NMAD on stable ground"


def test_lod_keeps_stated_when_stable_ground_is_quiet():
    r = level_of_detection(0.054, 0.054, stable_nmad_m=0.01)
    assert r["lod_m"] == pytest.approx(math.sqrt(2) * 0.054)


def test_volume_totals_simple_grid():
    # 2 x 3 grid, 10 m2 cells. One cell lost 2 m, one gained 3 m, one tiny change, one NaN.
    d = np.array([[-2.0, 3.0, 0.01], [np.nan, 0.0, 0.0]])
    t = volume_totals(d, 10.0, lod_m=0.1)
    assert t["cut_m3"] == pytest.approx(20.0)
    assert t["fill_m3"] == pytest.approx(30.0)
    assert t["net_m3"] == pytest.approx(10.0)
    assert t["cut_area_m2"] == 10.0 and t["fill_area_m2"] == 10.0
    assert t["area_changed_m2"] == 20.0
    assert t["cells_counted"] == 2
    assert t["cells_valid"] == 5


def test_volume_uncertainty_scales_with_area_and_lod():
    d = np.full((10, 10), 1.0)
    t = volume_totals(d, 1.0, lod_m=0.2)
    assert t["fill_m3"] == pytest.approx(100.0)
    assert t["fill_uncertainty_m3"] == pytest.approx(100 * 0.2)
    assert t["cut_uncertainty_m3"] == 0.0


def test_changes_below_lod_are_ignored():
    d = np.full((4, 4), 0.05)
    t = volume_totals(d, 1.0, lod_m=0.076)
    assert t["fill_m3"] == 0.0 and t["cells_counted"] == 0


def test_excluded_cells_do_not_count():
    d = np.full((4, 4), 2.0)
    water = np.zeros((4, 4), dtype=bool)
    water[:2] = True
    t = volume_totals(d, 1.0, lod_m=0.1, exclude=water)
    assert t["fill_m3"] == pytest.approx(16.0)
    assert t["cells_valid"] == 8


def test_find_pool_detects_flat_sheet():
    # Sloping ground that gained a little, plus a flat lake at 50.0 m that gained 3 m.
    y, x = np.mgrid[0:60, 0:60]
    before = 40.0 + 0.2 * x
    after = before + 0.5
    lake = (x > 10) & (x < 40) & (y > 10) & (y < 40)
    after[lake] = 50.0
    diff = after - before
    r = find_pool(after, diff, lod_m=0.1, cell_m=1.0)
    assert r["found"]
    assert r["pool_elev_m"] == pytest.approx(50.0, abs=0.2)
    # Slope is a central difference over 5-cell block averages, so the mask may hesitate
    # within two blocks (10 cells) of the shore. Deep inside the lake it must be solid.
    inner = (x > 20) & (x < 30) & (y > 20) & (y < 30)
    assert r["mask"][inner].all()
    assert not r["mask"][~lake].any()


def test_find_pool_without_a_lake():
    y, x = np.mgrid[0:30, 0:30]
    after = 10.0 + 0.3 * x + 0.1 * y
    diff = np.full_like(after, 0.5)
    r = find_pool(after, diff, lod_m=0.1, cell_m=1.0)
    assert not r["found"]
