"""Meaningful geometry, abstention and optional model failure regression checks."""
import unittest
from unittest.mock import patch
import cv2
import numpy as np
import water_depth as wd


class WaterDepthTests(unittest.TestCase):
    def test_upload_only_water_does_not_require_a_dry_reference(self):
        image=np.zeros((200,240,3),np.uint8)
        probability=np.full((200,240),.1,np.float32); probability[100:]=.8
        with patch.object(wd,'_water_probability',return_value=probability) as inference:
            result=wd.estimate_reference_depth(None,image,[],[])
        self.assertEqual(inference.call_count,1)
        self.assertEqual(result['status'],'water-detected-no-usable-reference')
        self.assertIsNone(result['estimatedDepthMm'])
        self.assertIsNone(result['waterEvidence']['dryCoverage'])
        self.assertFalse(result['waterEvidence']['dryControlAvailable'])
        self.assertGreater(len(result['maskContours']),0)

    def test_no_water_does_not_estimate(self):
        image=np.zeros((200,240,3),np.uint8)
        with patch.object(wd,'_water_probability',return_value=np.full((200,240),.1,np.float32)):
            result=wd.estimate_reference_depth(image,image,[],[])
        self.assertIsNone(result['estimatedDepthMm'])
        self.assertEqual(result['status'],'weak-water-evidence')

    def test_model_failure_preserves_null_result(self):
        image=np.zeros((200,240,3),np.uint8)
        with patch.object(wd,'_water_probability',side_effect=TypeError('API change')):
            result=wd.estimate_reference_depth(image,image,[],[])
        self.assertIsNone(result['estimatedDepthMm'])
        self.assertIn('TypeError',result['status'])

    def test_local_water_transition_is_required(self):
        probability=np.full((200,240),.8,np.float32)
        self.assertIsNone(wd._water_contact(probability,(probability>.5).astype(np.uint8),120,70,150,20))
        probability[:110]=.1
        contact=wd._water_contact(probability,(probability>.5).astype(np.uint8),120,70,150,20)
        self.assertIsNotNone(contact)
        self.assertAlmostEqual(contact['y'],110,delta=2)

    def test_water_without_reference_abstains(self):
        image=np.zeros((200,240,3),np.uint8)
        wet=np.full((200,240),.1,np.float32); wet[100:]=.8
        dry=np.full((200,240),.1,np.float32)
        with patch.object(wd,'_water_probability',side_effect=[wet,dry]):
            result=wd.estimate_reference_depth(image,image+1,[],[])
        self.assertEqual(result['status'],'water-detected-no-usable-reference')
        self.assertIsNone(result['estimatedDepthMm'])
        self.assertGreater(len(result['maskContours']),0)

    def test_dry_control_prevents_same_mask_estimate(self):
        image=np.zeros((200,240,3),np.uint8)
        probability=np.full((200,240),.8,np.float32)
        with patch.object(wd,'_water_probability',return_value=probability):
            result=wd.estimate_reference_depth(image,image,[],[])
        self.assertIsNone(result['estimatedDepthMm'])
        self.assertEqual(result['status'],'weak-water-evidence')

    def test_circle_measurement_exposes_assumption(self):
        image=np.zeros((200,240,3),np.uint8)
        cv2.circle(image,(120,150),20,(255,255,255),2)
        probability=np.full((200,240),.1,np.float32); probability[155:]=.8
        mask=(probability>.5).astype(np.uint8)
        obj={'category':'car','box':[.4,.3,.5,.55]}
        # Local ROI begins at y=109; circle's absolute center is y=150.
        with patch.object(cv2,'HoughCircles',return_value=np.array([[[24.,41.,20.]]],dtype=np.float32)):
            references=wd._wheel_references(image,probability,mask,[obj])
        self.assertEqual(len(references),1)
        reference=references[0]
        self.assertEqual(reference['dimensionRangeMm'],[450,750])
        self.assertIsNone(reference['sourceUrl'])
        self.assertEqual(reference['dimensionBasis'],'engineering-prior-unverified')
        self.assertGreater(reference['depthMm'],0)
        self.assertLessEqual(reference['rangeMm'][0],reference['depthMm'])
        self.assertGreaterEqual(reference['rangeMm'][1],reference['depthMm'])

    def test_center_vehicle_circle_is_rejected(self):
        image=np.zeros((200,240,3),np.uint8)
        cv2.circle(image,(156,150),20,(255,255,255),2)
        probability=np.full((200,240),.1,np.float32); probability[155:]=.8
        obj={'category':'motorcycle','box':[.4,.3,.5,.55]}
        with patch.object(cv2,'HoughCircles',return_value=np.array([[[60.,41.,20.]]],dtype=np.float32)):
            references=wd._wheel_references(image,probability,(probability>.5).astype(np.uint8),[obj])
        self.assertEqual(references,[])

    def test_reference_fraction_survives_resolution_change(self):
        depths=[]
        for scale in [1,2]:
            image=np.zeros((200*scale,240*scale,3),np.uint8)
            cv2.circle(image,(120*scale,150*scale),20*scale,(255,255,255),2*scale)
            probability=np.full((200*scale,240*scale),.1,np.float32); probability[155*scale:]=.8
            obj={'category':'car','box':[.4,.3,.5,.55]}
            # ROI starts at floor(109.5*scale), so keep absolute circle center.
            circles=np.array([[[24.*scale,150.*scale-int(109.5*scale),20.*scale]]],dtype=np.float32)
            with patch.object(cv2,'HoughCircles',return_value=circles):
                references=wd._wheel_references(image,probability,(probability>.5).astype(np.uint8),[obj])
            self.assertEqual(len(references),1)
            depths.append(references[0]['depthMm'])
        self.assertAlmostEqual(depths[0],depths[1],delta=2)

    def test_oem_entries_do_not_narrow_class_prior(self):
        # A car label supplies no generation, trim or fitted tire identity.
        self.assertEqual(wd._engineering_range('passenger-car-tire',[1,2]),[450,750])


if __name__ == '__main__':
    unittest.main()
