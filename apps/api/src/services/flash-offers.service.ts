import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { resolveUnitPrice } from '@gawjaay/shared';

export function flashRemaining(offer:{quantityLimit:number|null;quantitySold:number},stock:number|null){
  const limited=offer.quantityLimit==null?null:Math.max(0,offer.quantityLimit-offer.quantitySold);
  if(stock==null)return limited;
  return limited==null?Math.max(0,stock):Math.min(Math.max(0,stock),limited);
}
export async function getActiveFlashOffer(tx:Tx,storeId:string,variantId:string,now=new Date()){
  const offers=await tx.flashOffer.findMany({where:{storeId,variantId,status:'ACTIVE'},orderBy:{createdAt:'desc'},take:5});
  for(const o of offers){
    if((!o.endsAt||o.endsAt>now)&&(o.quantityLimit==null||o.quantitySold<o.quantityLimit)) return o;
    await tx.flashOffer.update({where:{id:o.id},data:{status:o.quantityLimit!=null&&o.quantitySold>=o.quantityLimit?'EXHAUSTED':'EXPIRED'}});
  }
  return null;
}
export async function effectiveUnitPrice(tx:Tx,storeId:string,variant:{id:string;price:number|null;product:{price:number;promoPrice:number|null}},now=new Date()){
  const normal=resolveUnitPrice({variantPrice:variant.price,productPrice:variant.product.price,productPromoPrice:variant.product.promoPrice}).effectivePrice;
  const flash=await getActiveFlashOffer(tx,storeId,variant.id,now);
  return flash&&flash.flashPrice<normal?{price:flash.flashPrice,flash}:{price:normal,flash:null};
}
export async function consumeFlashOffer(tx:Tx,offerId:string,quantity:number){
  if(quantity<=0)throw AppError.badRequest('Quantité Flash invalide');
  for(let i=0;i<5;i++){
    const o=await tx.flashOffer.findUnique({where:{id:offerId}});
    if(!o||o.status!=='ACTIVE'||(o.endsAt&&o.endsAt<=new Date()))throw AppError.conflict('Offre Flash indisponible. Actualisez.');
    if(o.quantityLimit!=null&&o.quantitySold+quantity>o.quantityLimit)throw AppError.conflict('Quantité Flash restante insuffisante.');
    const r=await tx.flashOffer.updateMany({where:{id:offerId,status:'ACTIVE',quantitySold:o.quantitySold,...(o.endsAt?{endsAt:{gt:new Date()}}:{})},data:{quantitySold:{increment:quantity}}});
    if(r.count===1){if(o.quantityLimit!=null&&o.quantitySold+quantity>=o.quantityLimit)await tx.flashOffer.update({where:{id:o.id},data:{status:'EXHAUSTED'}});return;}
  }
  throw AppError.conflict('Offre Flash momentanément indisponible. Réessayez.');
}
export async function createFlashOffer(tx:Tx,orgId:string,input:{storeId:string;variantId:string;flashPrice:number;quantityLimit?:number|null;endsAt?:Date|null}){
  if(input.flashPrice<=0)throw AppError.badRequest('Le prix Flash doit être supérieur à zéro.');
  if(input.quantityLimit==null&&!input.endsAt)throw AppError.badRequest('Une Offre Flash doit avoir une date de fin ou une quantité limitée.');
  if(input.quantityLimit!=null&&input.quantityLimit<=0)throw AppError.badRequest('La quantité Flash doit être supérieure à zéro.');
  if(input.endsAt&&input.endsAt<=new Date())throw AppError.badRequest('La date de fin doit être dans le futur.');
  const v=await tx.productVariant.findFirst({where:{id:input.variantId,isActive:true,product:{organizationId:orgId,isActive:true}},include:{product:true,inventories:{where:{storeId:input.storeId}}}});
  if(!v)throw AppError.notFound('Variante introuvable.');
  if(!v.inventories[0])throw AppError.badRequest('Aucun stock réel associé à cette boutique.');
  const normal=resolveUnitPrice({variantPrice:v.price,productPrice:v.product.price,productPromoPrice:v.product.promoPrice}).effectivePrice;
  if(input.flashPrice>=normal)throw AppError.badRequest('Le prix Flash doit être strictement inférieur au prix de vente réel.');
  if(await getActiveFlashOffer(tx,input.storeId,input.variantId))throw AppError.conflict('Une Offre Flash est déjà active pour cette variante dans cette boutique.');
  return tx.flashOffer.create({data:{organizationId:orgId,storeId:input.storeId,variantId:input.variantId,flashPrice:input.flashPrice,quantityLimit:input.quantityLimit??null,endsAt:input.endsAt??null,status:'ACTIVE'}});
}