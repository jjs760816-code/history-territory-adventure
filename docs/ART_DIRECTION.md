# 지도·미술·음향 제작 기준

## 화면 방향
삼국지14 공식 전략 화면에서 **넓은 지형 지도, 반투명 세력색, 가장자리 정보판, 인물 안내, 성장의 시각 피드백**을 분석해 독자적인 학습 게임 화면에 적용한다. 원작의 게임 화면·캐릭터·음악 파일은 사용하지 않는다. 이 버전은 웹 SVG 지도이며 원작의 3D 엔진이나 전투 그래픽을 재현한 것은 아니다.

참고한 공식 화면:
- https://www.koeitecmoeurope.com/manual/rtk14/en/3300.html
- https://www.koeitecmoeurope.com/manual/rtk14/en/images/3000/3300_01.png
- https://www.gamecity.ne.jp/sangokushi14/system-field.html
- https://www.gamecity.ne.jp/sangokushi14/images/system/domestic_image_4-1.jpg

짙은 숲색 정보 프레임, 따뜻한 종이색 지도, 절제한 금색 강조를 쓴다. 지도 바탕·하천·학습 표식·게임 점령색을 다른 층으로 표현한다. 역사 보기와 게임 영토는 서로 다른 정보를 보여준다.

## 역사 지도 근거
1. [비상교육 고등 한국사 교과서 연계 자료](https://dn.vivasam.com/brochure/11_5_high_history/korea_history3_4.pdf): PDF 14쪽, 교과서 15쪽 연계 「구석기와 신석기 시대의 유적지와 유물」. 지도 도판을 직접 열어 확인했다. 현행 초등 5학년 교과서 자체를 확인한 것으로 표현하지 않는다.
2. [국사편찬위원회 우리역사넷 선사 문화](https://contents.history.go.kr/front/ta/print.do?levelId=ta_m41_0030_0010&whereStr=): 전곡리·석장리·검은모루·굴포리 등 구석기 유적과 신석기 생활 설명.
3. [우리역사넷 어린이 한국사 고조선](https://contents.history.go.kr/data/pdf/eh/eh_r0005_0010.pdf): PDF 4쪽 「고조선의 문화 범위」를 직접 확인. 유물 분포를 바탕으로 한 참고 범위이며 확정된 국가 국경선이 아니다. 게임에서는 단순화한 새 점선을 사용한다.
4. [Natural Earth 육지](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/) 및 하천: [공공 영역 자료](https://www.naturalearthdata.com/about/terms-of-use/). 현재 해안선의 좌표를 단순화·투영한 SVG로 제작. 빙하기 해수면이나 시대별 실제 해안선을 복원한 지도가 아니다.
5. [국립중앙박물관 비파형 동검 설명](https://www.museum.go.kr/MUSEUM/contents/M0201030400.do?relicId=29833&schM=view&showHallId=760): 둥글고 넓은 아래 검몸, 중앙 위쪽의 좌우 돌기, 검몸과 자루의 구분을 도감의 간략 표식에 참고한다.

원본 교과서 도판을 게임 배경으로 복제하지 않았다. 지형은 공개 좌표 데이터로, 유적 표식은 참고 자료의 위치를 대조해 새로 구성했다. 유적 좌표는 교육용 개략 위치이며 정밀 발굴 위치는 아니다. 산 표식은 삽화이며 실제 표고 데이터가 아니다. 지도 투영은 작은 범위의 단순 투영이므로 축척은 개략값이다.

16개 게임 지역의 경계·잠금 단계는 학습 게임 규칙이다. 유적의 실제 시대와 특정 게임 지역의 해금 단계는 다른 개념이다. 기존 저장 기록 호환을 위해 지역 ID와 보상 규칙을 유지했다. 예전에 사용자가 보냈다는 원본 지도 이미지 파일은 이번 작업에서 회수하지 못했다. 이전 프로젝트의 지도 구조는 확인했고, 실제 해안선과 위 출처를 기준으로 새로 제작했다.

## 직접 제작한 미술
OpenAI 이미지 생성 도구로 만든 독자적인 게임 삽화. 원본 PNG는 별도 산출물 `history-game-artwork`에 보관하고, 웹에는 WebP로 압축한 파일만 사용한다. 실제 유물 사진 또는 확정 복원도라고 표시하지 않는다.

- `public/assets/valley-background.webp`: 신석기 강가 마을의 새벽 풍경. 숲·강·움집·옅은 안개, 자막 없는 넓은 구도.
- `public/assets/guide-haram.webp`: 가상의 안내 인물 하람. 빗살무늬 토기를 든 친근한 성인 장인, 투명 배경. 실존 인물 또는 복식 고증 완료 자료가 아니다.
- `public/assets/artifact-atlas.webp`: 3×3 유물·생활 카드 삽화. 주먹도끼, 불, 강가 터전, 빗살무늬 토기, 가락바퀴, 움집, 청동 도구, 고인돌, 신화의 곰. **7번째 동검 그림은 형태가 부정확해 사용하지 않는다.** 비파형 동검은 별도의 단순 SVG 표식으로 대체한다.

생성 프롬프트의 핵심:
- 배경: “Original premium historical strategy game key art, Neolithic Korean river valley at dawn, forested ridges, slow river, small thatched pit-house settlement, painterly realism, muted jade and warm ochre, atmospheric depth, left dark negative space for Korean UI, no text, no modern objects, no borrowed game assets.”
- 안내 인물: “Original friendly East Asian young adult prehistoric artisan guide holding a comb-pattern pottery vessel, natural woven and hide clothing, respectful educational game character, painterly realistic portrait, restrained earthy palette, full silhouette on transparent background, no text, not a known fictional character.”
- 카드: “Original 3 by 3 equal square educational history card illustration atlas, nine separate centered artifact or scene panels, handaxe, fire, riverside, comb pottery, spindle whorl, pit house, bronze dagger, dolmen, myth bear; muted museum palette, no labels or UI, no known game art.”

## 음향
외부 음악 생성 서비스는 `audio:generate` 연결 권한 부족으로 생성에 실패했다. 권한을 확대하거나 결제하지 않았다. 대체로 Web Audio 기반의 독자적인 짧은 오음계 배경음과 선택·정답·오답·점령·시대 발전 효과음을 구현한다. 실제 국악기 연주 녹음이나 전문 작곡 음원으로 표현하지 않는다. 배경음과 효과음은 각각 사용자가 켠 뒤에만 재생하고, 음량은 문제 읽기를 방해하지 않게 제한한다.

## 남은 검수 범위
학습 문항은 기존처럼 자체 제작·검수 대기 상태다. 시대별 영토 확대는 구석기·신석기·고조선 시연 범위이며, 이후 시대의 지도를 완성했다고 주장하지 않는다. 최종 교실 사용 전에는 초등 교육과정에 맞는 교사 검토가 필요하다.

## 추가 미술·음향(2026-10-23)

`journey-portraits.webp`는 동일한 가상 안내 인물을 선사·신석기·청동기·삼국·남북국·고려·조선·독립운동기·현대로 표현한 3×3 시대별 인물 아틀라스다. 참조한 자체 생성 하람 그림의 얼굴을 유지하고, 시대별 소품·복장을 학습용으로 상상해 새로 생성했다. 사진이나 복식 고증 완료 도판이 아니다. 실제 수천 년을 산 인물을 뜻하지 않고 시간여행을 돕는 인물이다. 생성 프롬프트: “Original Korean educational history game character portrait atlas, 3 by 3 equal cells, same fictional female face, chronological imaginative costumes from Paleolithic hide wrap, Neolithic pottery artisan, Bronze Age, Three Kingdoms, Unified Silla/Balhae, Goryeo celadon artisan, Joseon hanbok, early twentieth century student, modern museum explorer; no text, no frames, no borrowed characters; warm parchment background.”

배경 음악 `river-dawn.wav`(48초)는 별도 샘플을 쓰지 않고 현·관악기를 연상시키는 합성 파형과 독자적인 짧은 오음계 선율로 직접 제작했다. `scripts/build-soundtrack.py`에서 재생성할 수 있다. 전문 국악기 연주 녹음이라고 표시하지 않는다. 웹용은 모노 16kHz PCM으로 줄였으며 원본은 별도 산출물에 보관한다. 음악 생성 서비스 연결 실패를 이유로 게임이 멈추지 않도록 자체 제작 음원과 합성 효과음을 사용한다.

`chapter-scenes.webp`는 삼국 산성·남북국 바닷길·고려 무역항·조선 궁궐·독립운동기 거리·현대 탐험 풍경을 2열×3행으로 만든 시대 배경 아틀라스다. 각 시대의 분위기를 보여 주는 상상 삽화이며 실제 특정 유적의 복원도는 아니다. 생성 프롬프트는 “Original educational Korean history environment atlas, two columns by three rows, six separate landscapes: ancient mountain fortress, early medieval coastal harbor, Goryeo river trade and celadon, Joseon courtyard, peaceful Seoul street around 1919, contemporary museum garden, muted jade/gold atmospheric painterly realism, no text or existing game assets.”였다. 검토 중 독립운동기 배경에 잘못 들어간 현대 탑·고층 건물을 발견해 이미지 생성 도구로 해당 패널만 수정한 뒤 적용했다.
