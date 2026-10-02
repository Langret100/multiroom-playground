/* Phone/tablet portrait only. Desktop and ChromeOS touch devices retain their layout. */
(()=>{'use strict';
 const ua=navigator.userAgent||'',desktop=/Windows NT|CrOS|Linux x86_64/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints<2);
 const mobile=!desktop&&(navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1));
 const root=document.documentElement;root.dataset.phoneGame=(location.pathname.match(/\/games\/([^/]+)/)||[])[1]||'';
 function update(){
  const type=screen.orientation?.type,portrait=type?type.startsWith('portrait'):(innerHeight>=innerWidth||((window.visualViewport?.height||innerHeight)<innerHeight-120&&screen.height>screen.width));
  const active=mobile&&portrait;window.MobileViewport={mobile,portrait:active};root.classList.toggle('phone-portrait',active);
  root.style.setProperty('--phone-visible-height',(window.visualViewport?.height||innerHeight)+'px');
  window.dispatchEvent(new CustomEvent('phone-viewport-change'));
 }
 addEventListener('resize',update,{passive:true});addEventListener('orientationchange',update,{passive:true});window.visualViewport?.addEventListener('resize',update,{passive:true});update();
})();
