import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge', ROOT / 'bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.state = {'epoch':123,'revision':4,'display':{'kind':'fire','zone':2,'source':'test','count':1,'fresh':True}}

    def test_catalog_and_wire_ids_agree(self):
        catalog = json.loads((ROOT / 'alerts.json').read_text())
        self.assertEqual(list(bridge.KINDS), [a['id'] for a in catalog['kinds']])
        self.assertEqual(bridge.encode_command(self.state), b'cg_alert 1,123,4,7,2,1,1,1\r')

    def test_no_cli_injection_or_invalid_fields(self):
        for field, value in [('kind','fire\r\nsys_reboot'),('zone',-1),('zone',True),('source','camera'),('fresh',1),('count',0),('count',33)]:
            with self.subTest(field=field,value=value):
                state = copy.deepcopy(self.state); state['display'][field] = value
                with self.assertRaises(ValueError): bridge.encode_command(state)
        for key, value in [('epoch',0),('epoch',2**31),('revision',True)]:
            state = copy.deepcopy(self.state); state[key] = value
            with self.assertRaises(ValueError): bridge.encode_command(state)

    def test_only_matching_standalone_ack_counts(self):
        self.assertTrue(bridge.matches_ack(b'echo\r\nCG_ACK 1,123,4\r\n> ',123,4))
        for response in [b'CG_ACK 1,123,3\r\n',b'CG_ACK 1,123,40\r\n',b'log: CG_ACK 1,123,4\r\n',b'CG_ACK 1,123,4',b'cg_alert 1,123,4,7,2,1,1,1\r']:
            self.assertFalse(bridge.matches_ack(response,123,4))

    def test_fragmented_ack_through_serial_exchange(self):
        class Port:
            in_waiting = 1
            def __init__(self): self.chunks = iter([b'\r\nCG_A',b'CK 1,123,',b'4\r\n'])
            def reset_input_buffer(self): pass
            def write(self, command): self.command = command
            def flush(self): pass
            def read(self, count): return next(self.chunks,b'')
        port=Port()
        self.assertTrue(bridge.exchange(port,self.state,.2))
        self.assertTrue(port.command.startswith(b'cg_alert '))

    def test_beacon_requires_matching_telemetry_and_reports_speaker_failure(self):
        line=b'JG_STATUS 1,123,4,7,1,0,55,1,1,3,7,7,8388608\r\n'
        self.assertEqual(bridge.beacon_status(line,self.state),{'audioReady':True,'muted':False,'playing':True,'volume':55,'completed':3})
        self.assertIsNone(bridge.beacon_status(line.replace(b',123,4,',b',123,3,'),self.state))
        self.assertIsNone(bridge.beacon_status(line.replace(b',55,',b',100,'),self.state))
        self.assertIsNone(bridge.beacon_status(b'echo '+line,self.state))
        failure=b'JG_STATUS 1,123,4,7,1,0,55,0,0,0,-1,7,0\r\n'
        self.assertFalse(bridge.beacon_status(failure,self.state)['audioReady'])


if __name__ == '__main__': unittest.main()
