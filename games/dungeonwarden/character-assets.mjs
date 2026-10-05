// Source sheets are sampled once onto the accepted P1 pixel grid.
export const P1ModularAssets={create(catalog,images,factory){
 const directions=['front','side','back'],body={},heads={},items={};
 function sample(file,r,w,h){const c=factory(w,h),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(images[file],...r,0,0,w,h);return c;}
 for(const d of directions){body[d]={};for(const [name,r]of Object.entries(catalog.body.rects[d]))body[d][name]=sample(catalog.body.file,r,Math.round(r[2]/catalog.body.density),Math.round(r[3]/catalog.body.density));}
 for(const head of catalog.heads){heads[head.id]={};for(const d of directions){const native=body[d].head,entry={};for(const state of ['neutral','attack','hurt'])entry[state]=sample(state!=='neutral'&&head.expressionFile?head.expressionFile:head.file,state!=='neutral'&&head.expressionFile?head.expressionRects[d][state]:head.rects[d][state],native.width,native.height);
   for(const state of ['neutral','attack','hurt'])if(head.id!=='p1'){const c=entry[state],g=c.getContext('2d'),pixels=g.getImageData(0,0,c.width,c.height);for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;g.putImageData(pixels,0,0);c.trimBottom=0;}
   // An expression changes the face, never the hair silhouette or head anchor.
   for(const state of ['attack','hurt']){const c=factory(native.width,native.height),g=c.getContext('2d');g.drawImage(entry.neutral,0,0);if(d!=='back'){const mask=entry.neutral.getContext('2d').getImageData(0,0,native.width,native.height),face=entry[state].getContext('2d').getImageData(0,0,native.width,native.height),out=g.getImageData(0,0,native.width,native.height);for(let y=Math.floor(native.height*.66);y<native.height-2;y++)for(let x=3;x<native.width-3;x++){const i=(y*native.width+x)*4,r=mask.data[i],b=mask.data[i+2];if(mask.data[i+3]>200&&r>b*1.2&&face.data[i+3]>200)for(let k=0;k<4;k++)out.data[i+k]=face.data[i+k];}g.putImageData(out,0,0);}if(head.id!=='p1')c.trimBottom=0;entry[state]=c;}
   heads[head.id][d]=entry;
 }}
 if(catalog.weaponAssets)for(const [id,entry]of Object.entries(catalog.weaponAssets.entries)){const r=entry.rect,c=sample(catalog.weaponAssets.file,r,r[2],r[3]);c.grip={x:entry.grip[0],y:entry.grip[1]};c.motionLength=entry.length;c.assetId=id;items[id]=c;}
 return {body,heads,items,equipment:{},armor:{},rig(id='p1'){const sprites={},expressions={};for(const d of directions){sprites[d]={...body[d],head:heads[id]?.[d].neutral||body[d].head};expressions[d]=heads[id]?.[d];}return {sprites,expressions};}};
}};
