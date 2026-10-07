export type Override={fieldName:string;numericValue:string|null;textValue:string|null;dateValue:string|null;expiresAt:Date|null;isActive:boolean};
export function applyOverrides<T extends object>(record:T,overrides:Override[],now=new Date()):T{
  const result={...record}as Record<string,unknown>;
  for(const o of overrides){if(!o.isActive||(o.expiresAt&&o.expiresAt<=now))continue;if(!(o.fieldName in result))continue;
    if(o.numericValue!==null)result[o.fieldName]=['x01Ppd','cricketMpr','winPercentage'].includes(o.fieldName)?o.numericValue:Number(o.numericValue);
    else if(o.dateValue!==null)result[o.fieldName]=o.dateValue;else if(o.textValue!==null)result[o.fieldName]=o.textValue;
  }
  return result as T;
}
