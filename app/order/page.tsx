'use client'
import {useEffect,useState} from 'react'
import {Cookie,Plus,Minus,ShoppingBag,CheckCircle2} from 'lucide-react'
type Product={id:string;name:string;price_per_can:number}
export default function CustomerPage(){
 const [products,setProducts]=useState<Product[]>([])
 const [loading,setLoading]=useState(true)
 const [catalogError,setCatalogError]=useState('')
 const [quantities,setQuantities]=useState<Record<string,number>>({})
 const [name,setName]=useState('')
 const [phone,setPhone]=useState('')
 const [email,setEmail]=useState('')
 const [dueDate,setDueDate]=useState('')
 const [submitting,setSubmitting]=useState(false)
 const [error,setError]=useState('')
 const [receipt,setReceipt]=useState('')
 const [receiptTotal,setReceiptTotal]=useState(0)
 const money=(n:number)=>`RM ${n.toFixed(2)}`
 useEffect(()=>{let live=true;fetch('/api/guest-orders',{cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Catalog unavailable');if(live)setProducts(body.products||[])}).catch(e=>{if(live)setCatalogError(String(e.message||e))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[])
 const selected=products.filter(p=>(quantities[p.id]||0)>0).map(p=>({recipeId:p.id,cans:quantities[p.id]}))
 const cans=selected.reduce((sum,item)=>sum+item.cans,0)
 const totalPrice=selected.reduce((sum,item)=>sum+item.cans*Number(products.find(p=>p.id===item.recipeId)?.price_per_can??0),0)
 const today=new Date();const minDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(submitting)return
  if(selected.length===0){setError('Choose at least one biscuit.');return}
  if(cans>100){setError('A single order can contain at most 100 cans.');return}
  setSubmitting(true);setError('')
  try{
   const response=await fetch('/api/guest-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),phone:phone.trim(),email:email.trim(),dueDate,items:selected})})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error||'Unable to place order')
   setReceiptTotal(Number(result.totalPrice));setReceipt(result.orderId);setQuantities({})
  }catch(err){setError(err instanceof Error?err.message:'Unable to place order')}finally{setSubmitting(false)}
 }
 return <main className="min-h-screen bg-[#f8f5f0] px-4 py-8 text-[#302923] sm:py-14">
 <div className="mx-auto max-w-3xl">
 <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#8e5e42] p-3 text-white"><Cookie/></div><div><h1 className="font-serif text-2xl font-bold">Tan Bakery</h1><p className="text-sm text-[#75675c]">Fresh biscuits, ordered by the can</p></div></div></header>
 {receipt?<div role="status" className="rounded-2xl border bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto mb-4 size-12 text-green-700"/><h2 className="font-serif text-2xl font-bold">Order received!</h2><p className="mt-2 text-sm">Your request has been sent to the bakery for review.</p><p className="mt-4 break-all text-sm font-medium">Reference: {receipt}</p><p className="mt-3 text-xl font-bold text-[#8e5e42]">Order total: {money(receiptTotal)}</p><p className="mt-3 text-sm text-[#78685d]">Please save this reference. This is not a payment confirmation.</p><button onClick={()=>setReceipt('')} className="mt-6 rounded-lg bg-[#8e5e42] px-5 py-3 text-white">Place another order</button></div>:
 <form onSubmit={submit} className="space-y-6">
 <section className="rounded-2xl border border-[#ebdfd4] bg-white p-5 shadow-sm sm:p-7"><h2 className="font-serif text-xl font-bold">Choose your biscuits</h2><p className="mt-1 text-sm text-[#76685c]">Each quantity represents cans, not individual biscuits. Select multiple types.</p>
 {loading?<p className="py-8 text-sm">Loading biscuits...</p>:catalogError?<p role="alert" className="py-6 text-sm text-red-700">{catalogError}</p>:products.length===0?<p className="py-8 text-sm text-[#796c60]">No biscuits available for online orders yet.</p>:<div className="mt-5 space-y-3">{products.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#ede2d8] px-4 py-3"><div className="flex items-center gap-2"><Cookie className="size-5 text-[#966748]"/><span className="font-medium">{p.name}</span><span className="text-xs font-semibold text-[#8e5e42]">{money(Number(p.price_per_can))} / can</span></div><div className="flex items-center gap-2"><button type="button" aria-label={`Remove one can of ${p.name}`} disabled={!quantities[p.id]} onClick={()=>setQuantities(old=>({...old,[p.id]:Math.max(0,(old[p.id]||0)-1)}))} className="rounded-lg border p-2 disabled:opacity-30"><Minus className="size-4"/></button><span aria-live="polite" className="w-8 text-center font-semibold">{quantities[p.id]||0}</span><button type="button" aria-label={`Add one can of ${p.name}`} disabled={(quantities[p.id]||0)>=50||cans>=100} onClick={()=>setQuantities(old=>({...old,[p.id]:(old[p.id]||0)+1}))} className="rounded-lg border p-2 disabled:opacity-30"><Plus className="size-4"/></button><span className="text-xs text-[#77675b]">cans</span></div></div>)}</div>}
 </section>
 <section className="rounded-2xl border border-[#ebdfd4] bg-white p-5 shadow-sm sm:p-7"><h2 className="font-serif text-xl font-bold">Your contact details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Full name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#ccbbab] bg-white p-3 text-base text-[#302923]" placeholder="Your name"/></label><label className="text-sm font-medium">Phone / WhatsApp<input required maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#ccbbab] bg-white p-3 text-base text-[#302923]" placeholder="+60..."/></label><label className="text-sm font-medium">Email<input required type="email" maxLength={180} value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#ccbbab] bg-white p-3 text-base text-[#302923]" placeholder="name@example.com"/></label><label className="text-sm font-medium">Requested pickup date<input required type="date" min={minDate} value={dueDate} onChange={e=>setDueDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#ccbbab] bg-white p-3 text-base text-[#302923]"/></label></div></section>
 <section className="rounded-2xl border border-[#ebdfd4] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><ShoppingBag className="size-5"/>Total order</span><span className="text-lg font-bold">{cans} {cans===1?'can':'cans'}</span></div><div className="mt-3 flex items-center justify-between border-t pt-3"><span className="font-semibold">Total price</span><span className="text-xl font-bold text-[#8e5e42]">{money(totalPrice)}</span></div><p className="mt-2 text-xs text-[#77675b]">Order requests require bakery confirmation. Payment is not collected online.</p>{error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button type="submit" disabled={submitting||cans===0||loading||!!catalogError} className="mt-5 w-full rounded-lg bg-[#8e5e42] p-3 font-semibold text-white disabled:opacity-40">{submitting?'Submitting...':'Submit order'}</button></section>
 </form>}
 </div></main>
}