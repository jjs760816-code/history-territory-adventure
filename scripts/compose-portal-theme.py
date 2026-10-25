import numpy as np,wave,json
from pathlib import Path
sr=22050;duration=60.;beat=.75;rng=np.random.default_rng(591);out=np.zeros((int(sr*duration),2),np.float64)
def hz(n):return 440*2**((n-69)/12)
def add(v,at,amp=1,pan=0):
 i=int(at*sr);n=min(len(v),len(out)-i)
 if n<=0:return
 out[i:i+n,0]+=v[:n]*amp*np.sqrt((1-pan)/2);out[i:i+n,1]+=v[:n]*amp*np.sqrt((1+pan)/2)
def tone(note,d,kind):
 t=np.arange(int(sr*d))/sr;f=hz(note)
 if kind=='pluck':
  v=sum(np.sin(2*np.pi*f*k*t+.15*k)*np.exp(-t*(2+k*.65))/k**1.35 for k in range(1,13));v*=np.minimum(t/.006,1);return v
 if kind=='flute':
  phase=2*np.pi*f*t+.12*np.sin(2*np.pi*5.2*t);v=np.sin(phase)+.16*np.sin(2*phase)+.045*np.sin(3*phase);env=np.minimum(t/.16,1)*np.minimum((d-t)/.25,1);return v*env*(.94+.06*np.sin(2*np.pi*4.7*t))
 v=np.zeros(len(t))
 for k in range(1,8):v+=(np.sin(2*np.pi*f*k*.999*t)+np.sin(2*np.pi*f*k*1.0015*t))/k**1.75
 return v*np.minimum(t/.45,1)*np.minimum((d-t)/.6,1)
def drum(kind):
 d=1.1 if kind=='buk' else .35;t=np.arange(int(sr*d))/sr
 if kind=='buk':return np.sin(2*np.pi*(51*t+23*(1-np.exp(-t*16))/16))*np.exp(-t*5.8)+.15*np.sin(2*np.pi*124*t)*np.exp(-t*16)+rng.normal(0,.025,len(t))*np.exp(-t*38)
 noise=rng.normal(0,1,len(t));return .55*np.sin(2*np.pi*360*t)*np.exp(-t*24)+.15*noise*np.exp(-t*33)
chords=[[50,57,62,66],[47,54,59,62],[43,50,55,59],[45,52,57,61]]
melody=[[(0,69,1),(1,71,.5),(1.5,74,1.5),(3,71,1)],[(0,69,1.5),(1.5,66,.5),(2,64,1),(3,66,1)],[(0,67,1),(1,69,1),(2,71,1.5),(3.5,69,.5)],[(0,66,1),(1,64,1),(2,62,2)],[(0,66,1),(1,69,1.5),(2.5,71,.5),(3,74,1)],[(0,76,1.5),(1.5,74,.5),(2,71,1),(3,69,1)],[(0,67,1.5),(1.5,66,.5),(2,64,1),(3,66,1)],[(0,64,1),(1,62,3)]]
for bar in range(20):
 at=bar*4*beat;ch=chords[bar%4] if bar<18 else chords[0];lift=.72 if bar<4 else 1 if bar<12 else 1.12 if bar<18 else .65
 for k,n in enumerate(ch):add(tone(n,3.5,'strings'),at,.038*lift,(k-1.5)*.35)
 for step in range(8):add(tone(ch[step%4]+12,1.25,'pluck'),at+step*.5*beat,.085*lift,(-.4 if step%2 else .4))
 if bar>=4:
  phrase=melody[(bar-4)%8] if bar<18 else [(0,66,1),(1,64,1),(2,62,2)]
  for b,n,l in phrase:add(tone(n,max(.4,l*beat+.12),'flute'),at+b*beat,.12*lift,.12)
 if bar<19:
  for b,amp in [(0,.25),(2,.16)]:add(drum('buk'),at+b*beat,amp*lift,-.12)
  if bar>=4:
   for b in [1,1.5,2.75,3.5]:add(drum('janggu'),at+b*beat,.055*lift,.38)
 if bar in [0,8,12,16]:
  t=np.arange(sr*4)/sr;gong=sum(np.sin(2*np.pi*110*k*t)*np.exp(-t*(.6+.12*k))/k for k in [1,1.47,2.08,2.73,3.65]);add(gong,at,.055,-.15)
# A short diffuse room tail, generated from the original dry mix only.
dry=out.copy()
for delay,gain in [(.071,.13),(.127,.11),(.233,.09),(.367,.07),(.521,.045)]:
 n=int(delay*sr);out[n:]+=dry[:-n,::-1]*gain
fade=int(sr*1.5);out[:fade]*=np.linspace(0,1,fade)[:,None];out[-fade:]*=np.linspace(1,0,fade)[:,None]
out=np.tanh(out*1.3);out*=.84/max(np.max(np.abs(out)),.001)
path=Path('work/history-play-theme.wav')
with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((out*32767).astype('<i2').tobytes())
print(json.dumps({'duration':duration,'sampleRate':sr,'peak':round(float(np.max(np.abs(out))),3),'rms':round(float(np.sqrt(np.mean(out*out))),3),'originalComposition':True}))
