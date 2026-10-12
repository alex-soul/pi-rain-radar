import {defaultUnits,unitChoices} from './weather-policy.js';
export const displayDefaults={...defaultUnits,directionFormat:'compass',directionConvention:'flow',sunMode:'event',moonMode:'event'};
export const displayChoices={...unitChoices,directionFormat:['compass','degrees'],directionConvention:['flow','meteorological'],sunMode:['event','position'],moonMode:['event','position']};
export const displayLabels={temperatureUnit:'Temperature units',windUnit:'Wind speed units',visibilityUnit:'Visibility units',pressureUnit:'Pressure units',rainUnit:'Rain accumulation units',directionFormat:'Wind direction format',directionConvention:'Wind arrow',sunMode:'Sun display',moonMode:'Moon display'};
export const displayChoiceLabel=(key,value)=>({C:'°C',F:'°F',kn:'knots',compass:'Compass',degrees:'Degrees',flow:'Blowing towards',meteorological:'Coming from',event:'Next event',position:'Altitude and direction'}[value]??value);
export function validDisplay(value={}){return Object.fromEntries(Object.entries(displayChoices).filter(([key,choices])=>choices.includes(value?.[key])).map(([key])=>[key,value[key]]));}
export function legacyDisplayFormats(legacy,astronomy){
 if(!legacy&&!astronomy)return null;
 const result={};
 for(const key of ['directionFormat','directionConvention'])result[key]=displayChoices[key].includes(legacy?.[key])?legacy[key]:displayDefaults[key];
 result.sunMode='event';result.moonMode='event';
 for(const id of ['sun','moon'])if(['event','position'].includes(astronomy?.[id]))result[id+'Mode']=astronomy[id];
 return result;
}
export const effectiveDisplay=(global={},overrides={})=>({...displayDefaults,...validDisplay(global),...validDisplay(overrides)});
