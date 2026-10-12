import {windUnits} from './weather-format.js';
export function readingValues(value,id,source,observedUnit,units){
 if(!Number.isFinite(value))return {canonicalValue:null,displayValue:null};
 let canonicalValue=value,displayValue=value;
 if(['temperature','feels','dew'].includes(id)){if(source==='ha'&&observedUnit==='F')canonicalValue=(value-32)/1.8;displayValue=units.temperatureUnit==='F'?canonicalValue*1.8+32:canonicalValue;}
 else if(['wind','gust'].includes(id)){if(source==='ha')canonicalValue=value/(windUnits[observedUnit]??1);displayValue=canonicalValue*(windUnits[units.windUnit]??1);}
 else if(id==='visibility'){canonicalValue=source==='ha'?value*(observedUnit==='mi'?1609.344:1000):Math.min(value,10000);displayValue=canonicalValue/(units.visibilityUnit==='mi'?1609.344:1000);}
 else if(id==='pressure'){canonicalValue=source==='ha'?value*(observedUnit==='inHg'?33.8638866667:observedUnit==='mmHg'?1.33322387415:1):value;displayValue=canonicalValue/(units.pressureUnit==='inHg'?33.8638866667:units.pressureUnit==='mmHg'?1.33322387415:1);}
 return {canonicalValue,displayValue};
}
