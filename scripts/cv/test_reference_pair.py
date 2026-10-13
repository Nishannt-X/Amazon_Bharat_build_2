"""An unverified reference is analysed, but cannot calibrate the uploaded photo."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import scene_references as sr
import water_depth as wd


class ReferencePairTests(unittest.TestCase):
    def test_unverified_pair_keeps_both_inventories_without_using_a_dry_control(self):
        dry = np.zeros((100, 120, 3), np.uint8)
        wet = np.ones_like(dry)
        curb = {'id': 'D1', 'category': 'curb', 'box': [.1, .5, .2, .1],
                'visibleHeightPixels': 10}
        water = {'id': 'W1', 'category': 'water', 'box': [0, .5, 1, .5]}
        raw_match = {'sceneMatched': True, 'registered': True, 'H': np.eye(3), 'hull': None}
        with patch.object(sr, 'dry_inventory', return_value=([curb], 'dry-model', False)), \
             patch.object(sr, 'grounded_inventory', return_value=([water], 'wet-model')), \
             patch.object(wd, 'estimate_reference_depth', return_value={'estimatedDepthMm': None}) as measure:
            evidence = sr.scene_reference_evidence(dry, wet, raw_match, allow_comparison=False)
        self.assertEqual(evidence['dryReferences'], [curb])
        self.assertEqual(evidence['wetReferences'], [water])
        self.assertFalse(evidence['referenceComparisonAllowed'])
        self.assertIsNone(measure.call_args_list[0].args[0])
        self.assertIs(measure.call_args_list[0].args[1], wet)
        self.assertIsNone(measure.call_args_list[1].args[0])
        self.assertIs(measure.call_args_list[1].args[1], dry)
        self.assertEqual(evidence['comparisons'][0]['status'], 'scene-not-matched')
        self.assertIsNone(evidence['comparisons'][0]['projectedPolygon'])
        self.assertIsNone(evidence['comparisons'][0]['depthMm'])

    def test_upload_without_reference_never_analyses_a_placeholder_as_dry(self):
        wet = np.ones((100, 120, 3), np.uint8)
        with patch.object(sr, 'dry_inventory') as inventory, \
             patch.object(sr, 'grounded_inventory', return_value=([], 'wet-model')), \
             patch.object(wd, 'estimate_reference_depth', return_value={'estimatedDepthMm': None}) as measure:
            evidence = sr.scene_reference_evidence(None, wet, None)
        inventory.assert_not_called()
        self.assertEqual(measure.call_count, 1)
        self.assertEqual(evidence['dryReferences'], [])
        self.assertIsNone(evidence['baselineWaterEvidence'])

    def test_verified_pair_can_use_its_dry_control(self):
        dry = np.zeros((100, 120, 3), np.uint8)
        wet = np.ones_like(dry)
        with patch.object(sr, 'dry_inventory', return_value=([], 'dry-model', False)), \
             patch.object(sr, 'grounded_inventory', return_value=([], 'wet-model')), \
             patch.object(wd, 'estimate_reference_depth', return_value={'estimatedDepthMm': None}) as measure:
            evidence = sr.scene_reference_evidence(dry, wet, {'sceneMatched': True})
        self.assertTrue(evidence['referenceComparisonAllowed'])
        self.assertIs(measure.call_args_list[0].args[0], dry)

    def test_unverified_cli_retains_real_matches_but_never_writes_alignment(self):
        root = Path(__file__).resolve().parents[2]
        image = root / 'public/demo/dry-highway-delhi.png'
        with tempfile.TemporaryDirectory() as directory:
            aligned = Path(directory) / 'aligned.jpg'
            output = subprocess.check_output([sys.executable, str(root / 'scripts/cv/analyze.py'),
                str(image), str(image), str(aligned), '--unregistered-reference'], timeout=30)
            evidence = json.loads(output)
            self.assertGreater(evidence['matches'], 50)
            self.assertNotEqual(evidence['alignmentMethod'], 'upload-only')
            self.assertFalse(evidence['registered'])
            self.assertFalse(evidence['sceneMatched'])
            self.assertIsNone(evidence['homography'])
            self.assertEqual(evidence['referenceCandidates'], [])
            self.assertFalse(aligned.exists())


if __name__ == '__main__':
    unittest.main()
