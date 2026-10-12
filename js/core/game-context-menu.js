// Suppress the browser menu without swallowing right-button gameplay input.
(function(){
  if(window.__gameContextMenuGuard)return;window.__gameContextMenuGuard=true;
  window.addEventListener('contextmenu',event=>{
    event.preventDefault();
  },{capture:true,passive:false});
})();
