// Compact dock only: shared charts and explanations retain their units/precision.
export function dockText(row){
  if(!row||row.value===null||!Number.isFinite(row.value))return '—';
  if(row.id==='visibility'){
    const cap=row.text.endsWith('+');return Number.parseFloat(row.text).toFixed(1)+(cap?'+':'');
  }
  if(row.id==='pressure')return Number.parseFloat(row.text).toFixed(row.unit==='inHg'?2:row.unit==='mmHg'?1:0);
  if(row.id==='uv')return row.value.toFixed(1);
  return row.text;
}
