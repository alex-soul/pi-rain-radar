export const grassDefaults=Object.freeze({enabled:false,rain:1,dew:1,solar:1,wind:1,air:1,drainage:1,sensitivity:1});
export const grassControls=[
 ['rain','Rain wetting','Higher values make fresh rainfall wet the grass faster.',0,3],
 ['dew','Dew wetting','Higher values add more wetness when temperature approaches dew point.',0,3],
 ['solar','Sun drying','Higher values dry the grass faster in measured sunlight.',0,3],
 ['wind','Wind drying','Higher values increase drying by wind in unsaturated air.',0,3],
 ['air','Air drying','Higher values increase drying as temperature rises above dew point.',0,3],
 ['drainage','Drainage','Higher values let retained water drain away faster.',0,3],
 ['sensitivity','Overall sensitivity','Higher values raise the displayed intensity for the same retained wetness.',0.25,2],
];
export function validateGrassSettings(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const result={...grassDefaults,...input};
 if(Object.keys(input).some(k=>!Object.hasOwn(grassDefaults,k))||typeof result.enabled!=='boolean')return null;
 for(const [key,,,min,max]of grassControls)if(!Number.isFinite(result[key])||result[key]<min||result[key]>max)return null;
 return result;
}
export const grassLabels=['Dry','Slightly damp','A little wet','Wet','Very wet','Soaked'];
export const grassHints=['Wellies not needed','Wellies not needed','Borderline · leaning dry','Borderline · leaning wet','Wellies recommended','Extreme wetness'];
