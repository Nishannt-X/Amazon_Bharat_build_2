"""Regression checks for missing anchors and unsupported projection geometry."""
import unittest
import cv2
import numpy as np
from anchors import assess_dry_anchors
from registration import registration
from scene_references import compare_references, base_assessment


class ReferenceCases(unittest.TestCase):
    def setUp(self):
        self.dry = np.full((200, 200, 3), 255, dtype=np.uint8)
        cv2.line(self.dry, (20, 140), (20, 175), (0, 0, 0), 3)
        self.wet = np.full_like(self.dry, 255)
        self.match = {'sceneMatched': True, 'H': np.eye(3),
            'hull': np.float32([[0, 0], [199, 0], [199, 199], [0, 199]]).reshape(-1, 1, 2)}

    def test_hidden_edge_is_not_automatically_submerged_or_measured(self):
        anchors = assess_dry_anchors(self.dry, self.wet, self.match)
        self.assertTrue(anchors)
        self.assertTrue(all(a['status'] == 'hidden-or-changed' for a in anchors))
        self.assertTrue(all(a['physicalHeightMm'] is None for a in anchors))
        self.assertTrue(all('not proof' in a['reason'] for a in anchors))

    def test_matching_building_plane_does_not_support_foreground_anchor(self):
        self.match['hull'] = np.float32([[0, 0], [199, 0], [199, 80], [0, 80]]).reshape(-1, 1, 2)
        self.assertTrue(all(a['status'] == 'unsupported-plane'
            for a in assess_dry_anchors(self.dry, self.wet, self.match)))

    def test_cropped_out_reference_is_not_called_submerged(self):
        self.match['H'][0, 2] = 220
        self.assertTrue(all(a['status'] == 'outside-overlap'
            for a in assess_dry_anchors(self.dry, self.wet, self.match)))

    def test_visible_reference_without_scale_remains_unscaled(self):
        self.assertTrue(all(a['status'] == 'visible-unscaled'
            for a in assess_dry_anchors(self.dry, self.dry.copy(), self.match)))

    def test_unrelated_images_do_not_establish_a_scene_match(self):
        rng = np.random.default_rng(7)
        dry = rng.integers(0, 256, (300, 400, 3), dtype=np.uint8)
        wet = rng.integers(0, 256, (300, 400, 3), dtype=np.uint8)
        result = registration(dry, wet)
        self.assertFalse(result['sceneMatched'])
        self.assertFalse(result['registered'])

    def test_small_static_patch_does_not_register_whole_road_scene(self):
        rng = np.random.default_rng(18)
        dry = np.full((500,500,3),255,dtype=np.uint8)
        dry[50:200,250:400] = rng.integers(0,256,(150,150,3),dtype=np.uint8)
        wet = cv2.warpAffine(dry,np.float32([[1,0,-80],[0,1,15]]),(500,500),borderValue=(255,255,255))
        result = registration(dry,wet)
        self.assertTrue(result['sceneMatched'])
        self.assertFalse(result['registered'])

    def reference(self, identity, category='column', box=None):
        return {'id':identity,'category':category,'box':box or [.1,.2,.1,.4],
            'visibleHeightPixels':80,'visibleWidthPixels':20,'physicalHeightMm':None}

    def test_duplicate_dry_columns_cannot_claim_same_wet_reference(self):
        dry_items = [self.reference('S1'),self.reference('S2')]
        wet_items = [self.reference('S3')]
        result = compare_references(self.dry,self.wet,dry_items,wet_items,self.match)
        self.assertTrue(all(r['status']=='ambiguous-repeated-reference' for r in result))
        self.assertTrue(all(r['projectedExtentRatio'] is None for r in result))

    def test_possible_car_occlusion_is_not_a_water_depth(self):
        anchor = self.reference('S1')
        car = self.reference('S2','car',[.08,.55,.2,.25])
        result = base_assessment(anchor,[anchor,car])
        self.assertEqual(result['status'],'possible-object-occlusion')
        self.assertEqual(result['occluderIds'],['S2'])

    def test_partial_projection_suppresses_extent_ratio(self):
        dry_item = self.reference('S1',box=[.8,.2,.3,.4])
        wet_item = self.reference('S2',box=[.8,.2,.2,.4])
        result = compare_references(self.dry,self.wet,[dry_item],[wet_item],self.match)[0]
        self.assertEqual(result['status'],'partially-outside-view')
        self.assertIsNone(result['projectedExtentRatio'])

    def test_hull_support_is_not_claimed_as_plane_validation(self):
        result = compare_references(self.dry,self.wet,[self.reference('S1')],[self.reference('S2')],self.match)[0]
        self.assertTrue(result['centerSupported'])
        self.assertTrue(result['baseSupported'])
        self.assertFalse(result['planeValidated'])
        self.assertIsNone(result['depthMm'])

    def test_box_extent_ratio_respects_non_square_pixel_geometry(self):
        image = np.full((100,400,3),255,np.uint8)
        match = dict(self.match,H=np.float64([[1,.2,0],[0,1,0],[0,0,1]]),
            hull=np.float32([[0,0],[399,0],[399,99],[0,99]]).reshape(-1,1,2))
        dry_item = self.reference('S1',box=[.2,.2,.2,.4])
        wet_item = self.reference('S2',box=[.21,.2,.22,.4])
        wet_item['visibleHeightPixels']=40
        result=compare_references(image,image,[dry_item],[wet_item],match)[0]
        self.assertEqual(result['projectedExtentRatio'],1.)


if __name__ == '__main__':
    unittest.main()
