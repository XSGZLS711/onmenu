// CARD retains the stored code used by existing credit-card sales.
const PAYMENT_TYPES=[{"code":"CASH","label":"Cash","hint":"Notes & coins"},{"code":"MPAISA","label":"M-PAiSA","hint":"Mobile wallet"},{"code":"MYCASH","label":"MyCash","hint":"Mobile wallet"},{"code":"CHEQUE","label":"Cheque","hint":"Bank cheque"},{"code":"EFTPOS","label":"EFTPOS","hint":"Debit terminal"},{"code":"CARD","label":"Credit Card","hint":"Card terminal"},{"code":"VOUCHER","label":"Voucher","hint":"Voucher payment"},{"code":"EBANKING","label":"EBanking","hint":"Bank transfer"}];
const DEFAULT_PAYMENT_METHODS=['CASH','MPAISA','CARD'];
function paymentLabel(code){return PAYMENT_TYPES.find(type=>type.code===code)?.label||code;}
function configuredPaymentMethods(value){return Array.isArray(value)?PAYMENT_TYPES.map(type=>type.code).filter(code=>value.includes(code)):DEFAULT_PAYMENT_METHODS.slice();}

function paymentNeedsBank(method){return ['EFTPOS','CARD','EBANKING','CHEQUE'].includes(method);}
function paymentBankName(bankId){return (state.paymentBanks||[]).find(bank=>Number(bank.id)===Number(bankId))?.name||'';}

// Round positive percentage fees to cents using integer arithmetic.
function creditCardSurcharge(amount,rate){
 if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(rate)||rate<=0)return 0;
 const cents=Math.round(amount*100),hundredths=Math.round(rate*100);
 if(!Number.isSafeInteger(cents)||!Number.isSafeInteger(hundredths))throw Error('Payment amount is too large.');
 return Number((BigInt(cents)*BigInt(hundredths)+5000n)/10000n)/100;
}
function creditCardQuote(saleTotal,payment,rate){
 if(!Number.isFinite(rate)||rate<0||rate>100||Math.abs(Math.round(rate*100)-rate*100)>0.00001)throw Error('Invalid company credit card fee. Refresh company settings.');
 const parts=payment.parts||[payment],cards=parts.filter(p=>p.method==='CARD');
 if(cards.length>1||parts.some(p=>p.method!=='CARD'&&p.baseAmount!=null))throw Error('Invalid credit card payment.');
 if(!cards.length)return {total:saleTotal,surcharge:0,cardBase:0};
 const card=cards[0];if(rate>0&&card.baseAmount==null)throw Error('Reopen payment and review the credit card surcharge.');
 const base=Number(card.baseAmount??card.tendered);
 if(!Number.isFinite(base)||base<=0||base>saleTotal||Math.abs(Math.round(base*100)-base*100)>0.00001)throw Error('Credit card amount must be within the sale balance, before surcharge.');
 const surcharge=creditCardSurcharge(base,rate);
 if(Math.round(Number(card.tendered)*100)!==Math.round((base+surcharge)*100))throw Error('Credit card charge changed. Review the surcharge.');
 return {total:Math.round((saleTotal+surcharge)*100)/100,surcharge,cardBase:base};
}

// Round once on the whole transaction, including a card surcharge.
function cashRounding(total,parts){return parts.some(p=>p.method==='CASH')?(Math.round(Math.round(total*100)/5)*5-Math.round(total*100))/100:0;}
