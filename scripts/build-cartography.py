"""Build a lightweight, geographic SVG atlas from public-domain Natural Earth data.
Run with --source-dir pointing at downloaded land.geojson and rivers.geojson.
Historical overlays are documented teaching approximations, never state borders.
"""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
BBOX = (118.0, 32.0, 134.5, 46.4)

def project(p):
    return [round(20 + (p[0] - 118) * 57.1, 2), round(20 + (46.4 - p[1]) * 70, 2)]

def clip(poly, nx, ny, limit):
    out = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        da, db = a[0] * nx + a[1] * ny - limit, b[0] * nx + b[1] * ny - limit
        if da <= 1e-8:
            out.append(a)
        if (da <= 1e-8) != (db <= 1e-8):
            t = da / (da - db)
            out.append([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    return out

def simplify(points, epsilon=.009):
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = dx*dx + dy*dy
    best, idx = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = min(1, max(0, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
        d = (p[0]-a[0]-t*dx)**2 + (p[1]-a[1]-t*dy)**2
        if d > best:
            best, idx = d, i
    if best > epsilon*epsilon:
        return simplify(points[:idx+1], epsilon)[:-1] + simplify(points[idx:], epsilon)
    return [a, b]

def path(points, closed=False):
    return ('M'+'L'.join(','.join(str(v) for v in project(p)) for p in points)+('Z' if closed else '')) if points else ''

def overlaps(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return max(xs)>=BBOX[0] and min(xs)<=BBOX[2] and max(ys)>=BBOX[1] and min(ys)<=BBOX[3]

land = json.loads((args.source_dir/'land.geojson').read_text())
land_paths = []
for f in land['features']:
    g = f['geometry']
    polys = g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    for poly in polys:
        if not overlaps(poly[0]):
            continue
        for ring in poly:
            if not overlaps(ring):
                continue
            pts = simplify(ring)
            for nx, ny, lim in [(-1,0,-BBOX[0]),(1,0,BBOX[2]),(0,-1,-BBOX[1]),(0,1,BBOX[3])]:
                pts = clip(pts,nx,ny,lim) if pts else []
            if len(pts)>3:
                land_paths.append(path(pts, True))

rivers=[]
raw=json.loads((args.source_dir/'rivers.geojson').read_text())
names={'Yalu':'압록강','Tumen':'두만강','Han':'한강','Liao':'랴오허강','Songhua':'쑹화강','Di’er Songhua':'쑹화강','Nakdong':'낙동강'}
for f in raw['features']:
    g=f['geometry']; lines=g['coordinates'] if g['type']=='MultiLineString' else [g['coordinates']]
    for line in lines:
        if not overlaps(line):
            continue
        rivers.append({'name':names.get(f['properties'].get('name'),''),'d':path(simplify(line,.012))})

# Stable IDs preserve existing saved games. Names and geographic centers replace the old block map.
spec=[
 ('r01','요동·랴오허','고원','gojoseon','rival',[122.7,41.15]),
 ('r02','쑹화강 유역','산지','neolithic','neutral',[126.3,45.0]),
 ('r03','두만강·연해주','해안','neolithic','neutral',[130.5,43.0]),
 ('r04','대동강 유역','강가 평야','gojoseon','neutral',[125.75,39.05]),
 ('r05','압록강 유역','산지','paleolithic','neutral',[125.5,40.6]),
 ('r06','동북 해안','해안','neolithic','neutral',[129.25,40.55]),
 ('r07','한강 유역','강가 평야','neolithic','neutral',[126.99,37.54]),
 ('r08','임진·한탄강','산지','paleolithic','neutral',[127.06,38.05]),
 ('r09','동해 중부','해안','paleolithic','neutral',[129.0,37.75]),
 ('r10','금강 유역','강가 평야','paleolithic','neutral',[127.12,36.35]),
 ('r11','남한강 유역','산지','gojoseon','rival',[128.12,37.2]),
 ('r12','낙동강 유역','강가 평야','paleolithic','neutral',[128.65,35.85]),
 ('r13','영산강 유역','평야','gojoseon','neutral',[126.7,35.0]),
 ('r14','남해안','계곡','neolithic','neutral',[128.0,34.8]),
 ('r15','동남 해안','해안','gojoseon','neutral',[129.3,35.55]),
 ('r16','제주도','섬','neolithic','neutral',[126.5,33.38]),
]
centers=[project(s[5]) for s in spec]
regions=[]
for i,s in enumerate(spec):
    p=centers[i]; cell=[[0,0],[1000,0],[1000,1040],[0,1040]]
    for j,q in enumerate(centers):
        if i==j: continue
        cell=clip(cell,q[0]-p[0],q[1]-p[1],(q[0]**2+q[1]**2-p[0]**2-p[1]**2)/2)
    regions.append(dict(id=s[0],name=s[1],terrain=s[2],era=s[3],owner=s[4],location=s[5],label=p,points=' '.join(f'{a:.2f},{b:.2f}' for a,b in cell)))

game_area=[[120.2,42.0],[121.4,44.3],[124.0,46.2],[129.8,46.1],[132.4,43.0],[130.7,41.8],[130.2,39.5],[130.0,37.0],[129.7,35.1],[128.8,34.0],[127.3,33.0],[125.3,33.0],[124.5,35.4],[124.3,38.0],[124.0,39.5],[122.6,39.3],[121.0,38.6],[120.2,40.0]]
def site(name,lon,lat,era,region,note,offset):
    return dict(name=name,point=project([lon,lat]),era=era,regionId=region,note=note,labelOffset=offset)
sites=[
 site('전곡리',127.06,38.01,'paleolithic','r08','주먹도끼가 발견된 구석기 유적',[-112,-22]),
 site('석장리',127.14,36.45,'paleolithic','r10','금강 가의 구석기 유적',[-125,8]),
 site('수양개',128.31,36.96,'paleolithic','r11','남한강 유역의 구석기 유적',[80,-14]),
 site('검은모루',126.1,39.0,'paleolithic','r04','상원 지역의 구석기 유적',[-110,-6]),
 site('굴포리',130.4,42.3,'paleolithic','r03','한반도 동북부의 구석기 유적',[58,16]),
 site('빌레못 동굴',126.37,33.41,'paleolithic','r16','제주도의 구석기 동굴 유적',[-126,28]),
 site('암사동',127.13,37.56,'neolithic','r07','움집 터와 빗살무늬 토기',[-125,-12]),
 site('오산리',128.66,38.08,'neolithic','r09','동해안의 신석기 유적',[72,-12]),
 site('동삼동',129.08,35.07,'neolithic','r15','조개무지가 남은 신석기 유적',[68,4]),
 site('고산리',126.17,33.29,'neolithic','r16','이른 신석기 문화를 보여 주는 유적',[-122,26]),
]

# These are illustrative distributions read against the NIKH map, not traced political boundaries.
culture=[[121.0,42.2],[122.0,42.6],[124.1,42.2],[125.4,41.4],[126.5,40.7],[126.7,39.5],[126.8,38.2],[125.9,37.6],[124.7,38.0],[124.0,39.7],[122.3,40.0],[121.1,40.5]]
features=[
 dict(text='만주',point=project([125.2,44.25]),kind='region'),
 dict(text='한반도',point=project([127.7,38.8]),kind='region'),
 dict(text='서해',point=project([123.1,36.4]),kind='sea'),
 dict(text='동해',point=project([132.0,38.4]),kind='sea'),
 dict(text='남해',point=project([128.0,33.7]),kind='sea'),
 dict(text='요동 반도',point=project([121.5,39.4]),kind='place'),
 dict(text='백두산',point=project([128.06,41.99]),kind='mountain'),
 dict(text='랴오허강',point=project([122.5,42.65]),kind='river'),
 dict(text='쑹화강',point=project([126.8,45.4]),kind='river'),
 dict(text='압록강',point=project([124.85,40.4]),kind='river'),
 dict(text='두만강',point=project([130.0,42.6]),kind='river'),
]
mountains=[project(p) for p in [[127.2,43.8],[128.0,43.3],[128.4,42.8],[128.06,41.99],[127.6,41.1],[128.4,40.6],[128.1,39.7],[127.6,38.9],[128.5,38.1],[128.7,37.5],[128.8,36.8],[128.1,36.0],[127.5,35.4]]]
sources=[
 dict(title='비상교육 교과서 연계 자료 · 선사 문화 유적 분포',url='https://dn.vivasam.com/brochure/11_5_high_history/korea_history3_4.pdf',detail='고등 한국사 교과서 연계 자료 PDF 14쪽(교과서 15쪽). 지도 구성과 유적 위치 참고. 현행 초등 교과서 자체는 아님.'),
 dict(title='국사편찬위원회 우리역사넷 · 선사 문화',url='https://contents.history.go.kr/front/ta/print.do?levelId=ta_m41_0030_0010&whereStr=',detail='구석기·신석기 유적 분포와 생활 설명 참고.'),
 dict(title='우리역사넷 · 고조선의 문화 범위',url='https://contents.history.go.kr/data/pdf/eh/eh_r0005_0010.pdf',detail='4쪽 도판의 요동·대동강 문화 범위 참고. 게임의 점선은 이를 단순화해 새로 그린 예시이며 확정 국경이 아님.'),
 dict(title='Natural Earth · 지형 데이터',url='https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/',detail='1:10m 현대 해안선·하천. 공공 영역 자료. 과거 해안선 복원 데이터가 아님.'),
]
atlas=dict(version=1,viewBox=[0,0,1000,1040],landPath=''.join(land_paths),rivers=rivers,gameAreaPath=path(game_area,True),culturePath=path(culture,True),labels=features,mountains=mountains,sites=sites,islands=[dict(name='울릉도',point=project([130.9,37.5])),dict(name='독도',point=project([131.87,37.24]))],sources=sources,scale200km=round(200/111*70,2),eraNotes={
 'paleolithic':dict(title='사냥과 채집, 첫 발자국',subtitle='구석기 유적 분포',description='전곡리·석장리 등에서 옛사람들의 생활 흔적을 찾아보세요. 이 시기에는 나라의 국경을 그리지 않아요.'),
 'neolithic':dict(title='강과 바다 곁에 마을이 피어나다',subtitle='신석기 유적 분포',description='암사동·오산리·동삼동·고산리 등 강가와 바닷가의 마을 유적을 살펴보세요.'),
 'gojoseon':dict(title='청동의 빛, 나라의 시작',subtitle='고조선 문화 범위 참고도',description='요동과 대동강 유역의 문화 범위를 살펴보세요. 유물 분포와 나라의 정확한 국경은 같지 않아요.'),
},notice='역사 표시는 자료를 바탕으로 단순화했습니다. 점령 구역은 게임 규칙이며 실제 국경이 아닙니다. 바탕 해안선은 현재 기준입니다.')
(ROOT/'public/assets/cartography.json').write_text(json.dumps(atlas,ensure_ascii=False,separators=(',',':')))
(ROOT/'lib/map-regions.mjs').write_text('// Generated by scripts/build-cartography.py. Geographic centers; cells are game subdivisions, not historical borders.\nexport const MAP_REGIONS = '+json.dumps(regions,ensure_ascii=False,indent=2)+';\n')
print(json.dumps({'landParts':len(land_paths),'rivers':len(rivers),'regions':len(regions),'assetBytes':(ROOT/'public/assets/cartography.json').stat().st_size}))
