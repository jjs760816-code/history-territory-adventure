"""Original, deterministic ambient score; synthesized timbres, no samples or borrowed melody.
Writes a 48-second stereo PCM file; use macOS afconvert for the web AAC copy.
"""
import argparse, wave
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
SR=32000;DUR=48;N=SR*DUR;rng=np.random.default_rng(514);mix=np.zeros((N,2))
def add(sig,start,pan=0):
 i=int(start*SR);n=min(len(sig),N-i)
 if n<=0:return
 mix[i:i+n,0]+=sig[:n]*np.sqrt((1-pan)/2);mix[i:i+n,1]+=sig[:n]*np.sqrt((1+pan)/2)
def hz(m):return 440*2**((m-69)/12)
def string(m,dur=4,vol=.1):
 t=np.arange(int(SR*dur))/SR;f=hz(m);s=np.zeros(len(t))
 for k in range(1,9):s+=np.sin(2*np.pi*f*k*(1+.0001*k*k)*t+rng.random()*.3)*np.exp(-t*(.7+k*.25))/k**1.65
 return s*np.minimum(t/.008,1)*np.minimum((dur-t)/.2,1)*vol
# Original 16-bar, 64-beat pentatonic phrase at 80 BPM, with deliberate reading spaces.
phrase=[(0,67,1.5),(2,71,1.2),(4,74,1.5),(6,76,1.2),(8,74,2),(11,71,1.4),(14,69,1.6),(16,67,2.3),(20,62,1.6),(22,67,1.5),(24,69,1.5),(26,71,1.5),(28,74,2),(32,76,2),(35,79,1.4),(38,76,1.8),(41,74,2),(44,71,2),(48,69,2),(51,71,1.5),(54,67,2),(58,62,1.8),(61,67,1.8)]
for beat,m,d in phrase:
 add(string(m,4,.105),beat*.75,pan=.22*np.sin(beat))
 if beat>=16 and beat%4==0:
  t=np.arange(int(SR*d))/SR;vib=.0025*np.sin(2*np.pi*4.5*t);phase=2*np.pi*hz(m+12)*(t+vib*.018)
  env=np.minimum(t/.24,1)*np.minimum((d-t)/.4,1)*np.exp(-t*.28)
  flute=(np.sin(phase)+.18*np.sin(2*phase)+.05*np.sin(3*phase))*env*.025
  add(flute,beat*.75+.16,pan=-.25)
# Open fifth pads, low plucked anchors. No drum beat under questions.
for bar in range(8):
 start=bar*6;root=[43,48,50,43,52,48,50,43][bar]
 t=np.arange(SR*8)/SR;env=np.sin(np.pi*np.minimum(t/8,1))**2
 pad=sum(np.sin(2*np.pi*hz(root+k)*t+.08*np.sin(t*2))*amp for k,amp in [(0,.014),(7,.009),(12,.004)])*env
 add(pad,start,pan=0)
 add(string(root+12,5,.045),start+.05,pan=-.3)
# Quiet diffuse breath texture.
noise=rng.normal(0,1,N);smooth=np.convolve(noise,np.ones(33)/33,mode='same')*.002
mix+=smooth[:,None]
# Stereo room reflection, mixed low. Long tails wrap to permit a gentle loop.
dry=mix.copy()
for delay,gain in [(.11,.14),(.23,.1),(.39,.07),(.61,.045)]:
 shift=int(delay*SR);mix+=np.roll(dry[:,::-1],shift,axis=0)*gain
fade=np.minimum(np.arange(N)/SR/2,1)*np.minimum((N-np.arange(N))/SR/3,1)
mix*=fade[:,None];mix=np.tanh(mix*1.25);mix*=.63/max(.63,np.max(np.abs(mix)))
args.output.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(args.output),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((mix*32767).astype('<i2').tobytes())
print({'seconds':DUR,'peak':round(float(np.max(np.abs(mix))),3),'file':str(args.output)})
