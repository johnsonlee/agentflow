import {WHEAT_BONE_MEAL_PROFILE} from '../catalog/bone-meal-profile';
/** Pure versioned candidate policy. No implicit fallback for invalid age/random input. */
export function wheatBoneMealAge(age:number,draw:number):number|null{
 if(!Number.isInteger(age)||age<0||age>=WHEAT_BONE_MEAL_PROFILE.maximumAge||
  !Number.isFinite(draw)||draw<0||draw>=1)return null;
 return Math.min(WHEAT_BONE_MEAL_PROFILE.maximumAge,age+WHEAT_BONE_MEAL_PROFILE.minimumIncrement+
  Math.floor(draw*(WHEAT_BONE_MEAL_PROFILE.maximumIncrement-WHEAT_BONE_MEAL_PROFILE.minimumIncrement+1)));
}
