// Suppress the browser menu without swallowing right-button gameplay input.
(function(){
  if(window.__gameContextMenuGuard)return;window.__gameContextMenuGuard=true;
  window.addEventListener('contextmenu',event=>{
    const body=document.body;
    if(body?.classList.contains('page-room')&&!body.classList.contains('in-game'))return;
    event.preventDefault();
  },{capture:true,passive:false});
})();
