export function storageMeter(storage){
  const total=storage?.capacityBytes,used=storage?.usedBytes;
  if(!Number.isFinite(total)||total<=0||!Number.isFinite(used)||used<0||used>total)return null;
  return {total,used,percent:used/total*100};
}
export function paintStorageMeter(storage){
  const bar=document.getElementById('storage-meter'),label=document.getElementById('review-storage-short');if(!bar||!label)return;
  const value=storageMeter(storage);bar.dataset.unknown=String(!value);bar.dataset.level=value?.percent>=90?'full':'normal';
  bar.firstElementChild.style.width=(value?.percent??0)+'%';
  if(value){bar.setAttribute('aria-valuenow',value.percent.toFixed(1));const format=n=>(n/1073741824).toFixed(1)+' GiB';label.textContent=`Used ${format(value.used)} / Total ${format(value.total)}`;bar.setAttribute('aria-valuetext',label.textContent);}
  else{bar.removeAttribute('aria-valuenow');bar.setAttribute('aria-valuetext','Storage information unavailable');label.textContent='Storage information unavailable';}
}
