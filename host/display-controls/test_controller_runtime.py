"""Real controller loop with temporary backlight/state and stubbed Wayland calls."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import bridge


class ControllerRuntimeTests(unittest.TestCase):
    def test_applied_readback_failed_save_retry_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'max_brightness').write_text('31')
            (root/'brightness').write_text('20')
            failing=root/'fail-save';failing.touch()
            code='''
import sys,time
from pathlib import Path
from types import SimpleNamespace
import controller
root=Path(sys.argv[1])
sys.argv=['controller.py']
controller.config.load=lambda: dict(backlight=str(root),output='DSI-1')
controller.config.socket_path=lambda: str(root/'display.sock')
controller.config.events_address=lambda: '\\0radar-test-no-adapter-'+str(root)
controller.subprocess.run=lambda *a,**k: SimpleNamespace(stdout='DSI-1 on\\n')
controller.subprocess.Popen=lambda *a,**k: SimpleNamespace(poll=lambda:None,terminate=lambda:None,wait=lambda **k:None)
controller.Path.home=lambda: root
original=Path.replace
def replace(self,target):
    if target.name=='settings.json' and (root/'fail-save').exists(): raise OSError('synthetic save failure')
    return original(self,target)
Path.replace=replace
monotonic=time.monotonic
controller.time.monotonic=lambda: monotonic()*100
controller.main()
'''
            def start():
                return subprocess.Popen([sys.executable,'-c',code,str(root)],cwd=Path(__file__).parent,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            child=start()
            def request(action='status',value=None):
                return bridge.controller_request(str(root/'display.sock'),'',dict(action=action,**({} if value is None else {'value':value})))
            def wait(check):
                until=time.monotonic()+6
                while time.monotonic()<until:
                    if child.poll() is not None:
                        self.fail(child.communicate()[1].decode())
                    try:
                        state=request()
                        if check(state): return state
                    except OSError: pass
                    time.sleep(.08)
                self.fail('Controller did not reach expected state')
            try:
                wait(lambda s:not s['persistence_ok'])
                applied=request('brightness',48)
                self.assertEqual(applied['brightness_raw'],15)
                self.assertEqual(applied['brightness'],48)
                self.assertFalse(applied['persistence_ok'])
                request('idle_timeout',27);request('automatic_blanking',True)
                failing.unlink()
                wait(lambda s:s['persistence_ok'] and not s['persistence_pending'])
                child.terminate();child.communicate(timeout=4)
                child=start()
                restored=wait(lambda s:s['idle_timeout']==27 and s['automatic_blanking'])
                self.assertEqual(restored['brightness'],48)
            finally:
                child.terminate();out,err=child.communicate(timeout=4)
            self.assertEqual(child.returncode,0,err.decode())


if __name__=='__main__':
    unittest.main()
