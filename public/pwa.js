(() => {
  // The installed app belongs to the custom domain; keep the old game URL usable.
  if (!['xn--9t4b56g.com', 'localhost', '127.0.0.1'].includes(location.hostname)) {
    document.querySelectorAll('.pwa-open').forEach(button => button.addEventListener('click', () => location.assign('https://xn--9t4b56g.com/?install=1')));
    return;
  }
  let installPrompt;
  let installed = false;
  const standalone = () => installed || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /KAKAOTALK|NAVER\(|Line\/|Instagram|FBAN|FBAV|DaumApps/i.test(navigator.userAgent);
  const android = /Android/i.test(navigator.userAgent);
  const dialog = document.createElement('dialog');
  dialog.className = 'pwa-dialog';
  dialog.setAttribute('aria-labelledby', 'pwa-dialog-title');
  dialog.innerHTML = `<button type="button" class="pwa-close" aria-label="설치 안내 닫기">×</button><img src="/assets/pwa/icon-192.png" width="64" height="64" alt=""><p class="pwa-eyebrow">잼스 · 게임과 글</p><h2 id="pwa-dialog-title">홈 화면에 잼스를 담아요</h2><p>별도 파일을 다운로드하는 방식이 아니에요.<br>브라우저에서 설치하거나 홈 화면에 직접 추가해요.</p><div id="pwa-device-guide"></div><button type="button" id="pwa-install" hidden>잼스 앱 설치</button><button type="button" id="pwa-copy">잼스.com 주소 복사</button><p class="pwa-note">설치는 무료예요. 온라인 게임과 새 콘텐츠를 보려면 인터넷이 필요해요.</p><p class="pwa-status" role="status"></p>`;
  document.body.append(dialog);
  const guide = dialog.querySelector('#pwa-device-guide');
  const install = dialog.querySelector('#pwa-install');
  const status = dialog.querySelector('.pwa-status');
  function update() {
    document.querySelectorAll('.pwa-open').forEach(b => b.textContent = standalone() ? '앱 사용 안내' : installPrompt ? '앱 설치' : '설치 안내');
    install.hidden = !installPrompt || standalone();
    guide.innerHTML = standalone() ? '<p class="pwa-installed">홈 화면 앱으로 사용하고 있어요.</p><p>새 콘텐츠는 인터넷에 연결하면 확인할 수 있어요. 다른 사이트의 게임과 유튜브는 브라우저나 해당 앱에서 열릴 수 있어요.</p>' : inApp ? '<h3>다른 브라우저에서 열어 주세요</h3><p>카카오톡·네이버 같은 앱 안에서는 홈 화면 설치가 지원되지 않을 수 있어요. 아래에서 주소를 복사한 뒤, 아이폰은 <strong>Safari</strong>, 안드로이드는 <strong>Chrome</strong> 주소창에 붙여 넣어 열어 주세요.</p>' : ios ? '<h3>아이폰 · 아이패드</h3><ol><li>Safari에서 <strong>잼스.com</strong>을 열어요.</li><li>공유 버튼을 누르고 <strong>홈 화면에 추가</strong>를 선택해요.</li><li><strong>웹 앱으로 열기</strong>가 보이면 켜고 <strong>추가</strong>를 눌러요.</li></ol>' : android ? '<h3>안드로이드</h3><ol><li>Chrome에서 <strong>잼스.com</strong>을 열어요.</li><li>설치 버튼이 보이면 누르거나 Chrome 메뉴 <strong>⋮</strong>를 열어요.</li><li><strong>홈 화면에 추가 → 설치</strong>를 선택해요. 메뉴 이름은 브라우저에 따라 다를 수 있어요.</li></ol><p>설치 버튼이 보이지 않으면 브라우저 메뉴에서 직접 추가해 주세요.</p>' : '<h3>휴대폰에서 추가하기</h3><p><strong>아이폰·아이패드</strong>는 Safari의 공유 메뉴에서 <strong>홈 화면에 추가</strong>를 선택해요.</p><p><strong>안드로이드</strong>는 Chrome 메뉴의 <strong>홈 화면에 추가 → 설치</strong>를 선택해요.</p><p>컴퓨터에서는 브라우저 주소창이나 메뉴의 설치 기능을 사용할 수 있어요.</p>';
  }
  function showGuide() {update();status.textContent='';if(!dialog.open)dialog.showModal();}
  async function requestInstall() {
    if(!installPrompt || standalone()) {showGuide();return;}
    const prompt=installPrompt;installPrompt=null;update();
    try {
      await prompt.prompt();
      const choice=await prompt.userChoice;
      showGuide();
      status.textContent=choice.outcome==='accepted'?'설치를 요청했어요. 홈 화면을 확인해 주세요.':'설치를 취소했어요. 브라우저 메뉴에서 다시 설치할 수 있어요.';
    } catch {
      showGuide();status.textContent='설치창을 열지 못했어요. 아래 브라우저 메뉴 안내를 따라 추가해 주세요.';
    }
  }
  document.querySelectorAll('.pwa-open').forEach(b => b.addEventListener('click', requestInstall));
  dialog.querySelector('#pwa-copy').addEventListener('click', async () => {
    try {await navigator.clipboard.writeText('https://잼스.com/');status.textContent='주소를 복사했어요. Safari 또는 Chrome 주소창에 붙여 넣어 주세요.';}
    catch {status.textContent='Safari 또는 Chrome 주소창에 잼스.com을 직접 입력해 주세요.';}
  });
  dialog.querySelector('.pwa-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {if(e.target === dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  window.addEventListener('beforeinstallprompt', e => {e.preventDefault();installPrompt=e;update();});
  window.addEventListener('appinstalled', () => {installed=true;installPrompt=null;update();status.textContent='잼스를 설치했어요. 홈 화면에서 실행해 보세요.';});
  install.addEventListener('click', requestInstall);
  update();
  if(new URLSearchParams(location.search).get('install') === '1') dialog.showModal();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(() => {});
})();
