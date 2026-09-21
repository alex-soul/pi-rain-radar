export function cameraAt(records,time){
  let lo=0,hi=records.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(records[mid].time<=time)lo=mid+1;else hi=mid;}
  const row=records[lo-1];return row&&time-row.time<=600000?row:null;
}
export function cameraWindowCounts(records,start,end){
  const counts={metadata:0,acquisition:0};
  for(const row of records)if(row.time>=start&&row.time<=end&&Object.hasOwn(counts,row.basis))counts[row.basis]++;
  return counts;
}
