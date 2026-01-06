// Embedded build: Firebase stub to avoid external dependencies.
export function initFirebase(){
  return { app: null, db: null, api: {} };
}

export function makeId(len=10){
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for(let i=0;i<len;i++) out += chars[arr[i] % chars.length];
  return out;
}

export function nowMs(){ return Date.now(); }
