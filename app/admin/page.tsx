'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { LanguageProvider, useLanguage } from '@/components/language-provider'
import { calculateRequirements, convert, planProduction, getPiecesPerCan, formatQuantity, formatAlertQuantity, bilingualIngredient, suggestedIngredients, sampleRecipes, sampleStock, type Recipe, type StockItem, type Unit, type OrderItem } from '@/lib/biscuit-data'
import {
  AlertTriangle, Bell, CalendarDays, Check, ChevronDown, ClipboardList, Clock3,
  Cookie, Factory, FileText, Home, Inbox, Layers3, Menu, Package, Plus, Search,
  Settings, ShoppingCart, SlidersHorizontal, Sparkles, TrendingUp, X,
} from 'lucide-react'

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled'
type Order = { id: string; customer: string; items: string; qty: string; date: string; status: Status; method: string; shortage?: boolean; orderItems?: OrderItem[] }

type BakingAllocation = {orderId:string;recipeId:string;cans:number}
type BakingEvent = {id:string;recipeId:string;cans:number;bakedAt:string;note:string}
type GuestContact = { order_id:string; phone:string; email:string }
type ShoppingItem = { id:string; ingredientId:string; quantity:number; unit:Unit }
type Ingredient = { name: string; stock: string; min: string; unit: string; status: 'Good' | 'Low' | 'Out' }

const initialOrders: Order[] = [
  { id: 'ORD-1048', customer: 'Alicia Wong', items: 'Peanut Biscuit, Butter Cookies', qty: '250 pcs', date: 'Oct 28, 2026', status: 'In Progress', method: 'Delivery', orderItems: [{ recipeId: 'peanut-recipe', pieces: 150 }, { recipeId: 'butter-recipe', pieces: 100 }] },
  { id: 'ORD-1047', customer: 'Benjamin Lee', items: 'Almond Biscuit', qty: '4 boxes', date: 'Oct 29, 2026', status: 'Pending', method: 'Pickup', shortage: true, orderItems: [{ recipeId: 'almond-recipe', pieces: 240 }] },
  { id: 'ORD-1046', customer: 'Cindy Tan', items: 'Chocolate Chip', qty: '180 pcs', date: 'Oct 30, 2026', status: 'Pending', method: 'Delivery', orderItems: [{ recipeId: 'chocolate-recipe', pieces: 180 }] },
  { id: 'ORD-1045', customer: 'Daniel Lim', items: 'Peanut Biscuit', qty: '100 pcs', date: 'Nov 02, 2026', status: 'Pending', method: 'Pickup', orderItems: [{ recipeId: 'peanut-recipe', pieces: 100 }] },
  { id: 'ORD-1044', customer: 'Emilia Goh', items: 'Butter Cookies', qty: '3 boxes', date: 'Nov 04, 2026', status: 'Completed', method: 'Delivery' },
]
const ingredients: Ingredient[] = [
  { name: 'Peanut', stock: '800 g', min: '500 g', unit: 'g', status: 'Good' },
  { name: 'Flour', stock: '5.0 kg', min: '1.0 kg', unit: 'kg', status: 'Good' },
  { name: 'Butter', stock: '420 g', min: '500 g', unit: 'g', status: 'Low' },
  { name: 'Almond', stock: '0 g', min: '300 g', unit: 'g', status: 'Out' },
]
const nav = [
  { label: 'Dashboard', icon: Home }, { label: 'Customer Orders', icon: ClipboardList }, { label: 'Biscuit Recipes', icon: Cookie },
  { label: 'Ingredient Inventory', icon: Package }, { label: 'Ingredient Calculator', icon: SlidersHorizontal }, { label: 'Shopping List', icon: ShoppingCart },
  { label: 'Production Planning', icon: Factory }, { label: 'Order Calendar', icon: CalendarDays }, { label: 'Notifications', icon: Bell }, { label: 'Settings', icon: Settings },
]

function StatusPill({ status }: { status: string }) { const {tr}=useLanguage()
  const styles: Record<string, string> = { Pending: 'bg-[#fff4df] text-[#a36514]', 'In Progress': 'bg-[#e9f0ff] text-[#4568a9]', Completed: 'bg-[#e5f5ed] text-[#287a51]', Cancelled: 'bg-[#f7e8e6] text-[#a34d44]', Good: 'bg-[#e5f5ed] text-[#287a51]', Low: 'bg-[#fff4df] text-[#a36514]', Out: 'bg-[#f7e8e6] text-[#a34d44]' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status] || 'bg-[#f2eee9] text-[#746c65]'}`}>{tr(status)}</span>
}

export default function Page() { return <LanguageProvider><BiscuitFlowPage /></LanguageProvider> }
function BiscuitFlowPage() {
  const { language, setLanguage, tr } = useLanguage()
  const [active, setActive] = useState('Dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [guestContacts,setGuestContacts]=useState<Record<string,GuestContact>>({})
  const [shoppingItems,setShoppingItems]=useState<ShoppingItem[]>([])
  const [bakingEvents,setBakingEvents]=useState<BakingEvent[]>([])
  const [bakingAllocations,setBakingAllocations]=useState<BakingAllocation[]>([])
  const [bakeSaving,setBakeSaving]=useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [user,setUser] = useState<User|null>(null)
  const [authChecked,setAuthChecked] = useState(false)
  const [isAdmin,setIsAdmin] = useState(false)
  const [roleChecked,setRoleChecked] = useState(false)
  const [cloudError,setCloudError] = useState('')
  const [busy,setBusy] = useState(false)
  const previous = useRef({orders:new Map<string,string>(),recipes:new Map<string,string>(),stock:new Map<string,string>(),shopping:new Map<string,string>()})
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const client = getSupabase()
  useEffect(() => {
    if (!client) { setAuthChecked(true);return }
    let live = true
    client.auth.getUser().then(({data,error})=>{if(!live)return;if(error)setCloudError(error.message);setUser(data.user);setAuthChecked(true)})
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(live)setUser(session?.user??null)})
    return ()=>{live=false;subscription.unsubscribe()}
  },[client])
  useEffect(()=>{
    if(!client||!user){setIsAdmin(false);setRoleChecked(false);return}
    let live=true
    setRoleChecked(false)
    client.rpc('is_bakery_admin').then(({data,error})=>{
      if(!live)return
      setIsAdmin(!error&&data===true)
      setRoleChecked(true)
      if(error)setCloudError('Admin permission check failed: '+error.message)
    })
    return ()=>{live=false}
  },[client,user?.id])
  useEffect(()=>{
    if(!client||!user||!isAdmin){setHydrated(false);return}
    let live=true
    setHydrated(false)
    setCloudError('')
    Promise.all([
      client.from('biscuit_orders').select('*'),
      client.from('biscuit_recipes').select('*'),
      client.from('biscuit_stock').select('*'),
      client.from('biscuit_shopping_items').select('*'),
      client.from('biscuit_guest_order_contacts').select('order_id,phone,email'),
      client.from('biscuit_baking_events').select('id,recipe_id,cans,baked_at,note').order('baked_at',{ascending:false}),
      client.from('biscuit_baking_allocations').select('order_id,recipe_id,cans'),
    ]).then(([o,r,i,shopping,contacts,baking,allocations])=>{
      const error=o.error||r.error||i.error||contacts.error||baking.error||allocations.error
      if(shopping.error)setCloudError('Shopping list setup needed: run 20261026_cans_shopping.sql in Supabase SQL Editor. '+shopping.error.message)
      if(!live)return
      if(error){setCloudError(error.message);return}
      const loadedOrders:Order[]=(o.data??[]).map(x=>({id:x.id,customer:x.customer,items:x.items,qty:x.qty,date:x.date,status:x.status as Status,method:x.method,shortage:x.shortage,orderItems:x.order_items??[]}))
      const loadedRecipes:Recipe[]=(r.data??[]).map(x=>({id:x.id,name:x.name,yieldPieces:Number(x.yield_pieces),published:x.is_published===true,pricePerCan:Number(x.price_per_can??0),cansPerBatch:Number(x.cans_per_batch??1),ingredients:x.ingredients??[]}))
      const loadedStock:StockItem[]=(i.data??[]).map(x=>({id:x.id,name:x.name,quantity:Number(x.quantity),minimum:Number(x.minimum),unit:x.unit as Unit}))
      const loadedShopping:ShoppingItem[]=(shopping.data??[]).map(x=>({id:x.id,ingredientId:x.ingredient_id,quantity:Number(x.requested_quantity),unit:x.unit as Unit}))
      previous.current={
        orders:new Map(loadedOrders.map(x=>[x.id,JSON.stringify(x)])),
        recipes:new Map(loadedRecipes.map(x=>[x.id,JSON.stringify(x)])),
        stock:new Map(loadedStock.map(x=>[x.id,JSON.stringify(x)])),
        shopping:new Map(loadedShopping.map(x=>[x.id,JSON.stringify(x)]))
      }
      setBakingAllocations((allocations.data??[]).map(x=>({orderId:x.order_id,recipeId:x.recipe_id,cans:Number(x.cans)})));setBakingEvents((baking.data??[]).map(x=>({id:x.id,recipeId:x.recipe_id,cans:Number(x.cans),bakedAt:x.baked_at,note:x.note??''})));setGuestContacts(Object.fromEntries((contacts.data??[]).map(c=>[c.order_id,c as GuestContact])));setOrders(loadedOrders);setRecipes(loadedRecipes);setStock(loadedStock);setShoppingItems(loadedShopping);setHydrated(true)
    }).catch(e=>{if(live)setCloudError(String(e))})
    return ()=>{live=false}
  },[client,user?.id,isAdmin])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=orders.filter(x=>previous.current.orders.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,customer:x.customer,items:x.items,qty:x.qty,date:x.date,status:x.status,method:x.method,shortage:x.shortage??false,order_items:x.orderItems??[]}))
    client.from('biscuit_orders').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error){setCloudError('Order save failed: '+error.message);return}
      changed.forEach(x=>previous.current.orders.set(x.id,JSON.stringify(x)))
      client.from('biscuit_baking_allocations').select('order_id,recipe_id,cans').then(({data,error:allocationError})=>{
        if(allocationError)setCloudError('Allocation refresh failed: '+allocationError.message)
        else setBakingAllocations((data??[]).map(x=>({orderId:x.order_id,recipeId:x.recipe_id,cans:Number(x.cans)})))
      })
    })
  },[orders,hydrated,client,user])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=recipes.filter(x=>previous.current.recipes.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,name:x.name,yield_pieces:x.yieldPieces,is_published:x.published??false,price_per_can:x.pricePerCan??0,cans_per_batch:x.cansPerBatch??1,ingredients:x.ingredients}))
    client.from('biscuit_recipes').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error)setCloudError('Recipe save failed: '+error.message)
      else changed.forEach(x=>previous.current.recipes.set(x.id,JSON.stringify(x)))
    })
  },[recipes,hydrated,client,user])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=stock.filter(x=>previous.current.stock.get(x.id)!==JSON.stringify(x))
    if(!changed.length)return
    const rows=changed.map(x=>({owner_id:user.id,id:x.id,name:x.name,quantity:x.quantity,minimum:x.minimum,unit:x.unit}))
    client.from('biscuit_stock').upsert(rows,{onConflict:'owner_id,id'}).then(({error})=>{
      if(error)setCloudError('Stock save failed: '+error.message)
      else changed.forEach(x=>previous.current.stock.set(x.id,JSON.stringify(x)))
    })
  },[stock,hydrated,client,user])
  useEffect(()=>{
    if(!hydrated||!client||!user)return
    const changed=shoppingItems.filter(x=>previous.current.shopping.get(x.id)!==JSON.stringify(x))
    const removed=[...previous.current.shopping.keys()].filter(id=>!shoppingItems.some(x=>x.id===id))
    if(changed.length){
      client.from('biscuit_shopping_items').upsert(changed.map(x=>({owner_id:user.id,id:x.id,ingredient_id:x.ingredientId,requested_quantity:x.quantity,unit:x.unit})),{onConflict:'owner_id,id'}).then(({error})=>{
        if(error)setCloudError('Shopping list save failed: '+error.message)
        else changed.forEach(x=>previous.current.shopping.set(x.id,JSON.stringify(x)))
      })
    }
    if(removed.length){
      client.from('biscuit_shopping_items').delete().in('id',removed).eq('owner_id',user.id).then(({error})=>{
        if(error)setCloudError('Shopping item removal failed: '+error.message)
        else removed.forEach(id=>previous.current.shopping.delete(id))
      })
    }
  },[shoppingItems,hydrated,client,user])
  useEffect(()=>{
    if(user&&roleChecked&&!isAdmin)window.location.replace('/')
  },[user?.id,roleChecked,isAdmin])
  async function signIn(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(!client)return
    setBusy(true);setCloudError('')
    const data=new FormData(e.currentTarget)
    const {error}=await client.auth.signInWithPassword({email:String(data.get('email')),password:String(data.get('password'))})
    if(error)setCloudError(error.message)
    setBusy(false)
  }
  async function recordBaking(recipeId:string,cans:number,note:string){
    if(!client||!user||!isAdmin||bakeSaving)throw new Error('Admin session required')
    setBakeSaving(true)
    try{
      const {error}=await client.rpc('record_baked_cans',{p_recipe_id:recipeId,p_cans:cans,p_note:note})
      if(error)throw new Error(error.message)
      const response=await client.from('biscuit_baking_events').select('id,recipe_id,cans,baked_at,note').order('baked_at',{ascending:false})
      if(response.error)throw new Error('Baking saved but history refresh failed: '+response.error.message)
      setBakingEvents((response.data??[]).map(x=>({id:x.id,recipeId:x.recipe_id,cans:Number(x.cans),bakedAt:x.baked_at,note:x.note??''})))
      const stockResult=await client.from('biscuit_stock').select('*')
      if(stockResult.error)throw new Error('Baking saved, but ingredient inventory refresh failed: '+stockResult.error.message)
      const refreshed:StockItem[]=(stockResult.data??[]).map(x=>({id:x.id,name:x.name,quantity:Number(x.quantity),minimum:Number(x.minimum),unit:x.unit as Unit}))
      previous.current.stock=new Map(refreshed.map(x=>[x.id,JSON.stringify(x)]))
      setStock(refreshed)
    }finally{setBakeSaving(false)}
  }
  async function receiveIngredient(id:string,quantity:number,unit:Unit,shoppingId?:string){
    if(!client||!user||!isAdmin)throw new Error('Admin session required')
    const {error}=await client.rpc('receive_biscuit_ingredient',{p_ingredient_id:id,p_quantity:quantity,p_unit:unit})
    if(error)throw new Error(error.message)
    const refreshed=await client.from('biscuit_stock').select('*')
    if(refreshed.error)throw new Error('Stock received but refresh failed: '+refreshed.error.message)
    const newStock:StockItem[]=(refreshed.data??[]).map(x=>({id:x.id,name:x.name,quantity:Number(x.quantity),minimum:Number(x.minimum),unit:x.unit as Unit}))
    previous.current.stock=new Map(newStock.map(x=>[x.id,JSON.stringify(x)]))
    setStock(newStock)
    if(shoppingId)setShoppingItems(old=>old.filter(x=>x.id!==shoppingId))
  }
  const bakedTotals=useMemo(()=>Object.fromEntries(recipes.map(r=>[r.id,Math.max(0,bakingEvents.filter(e=>e.recipeId===r.id).reduce((a,e)=>a+e.cans,0)-bakingAllocations.filter(a=>a.recipeId===r.id).reduce((n,a)=>n+a.cans,0))])),[recipes,bakingEvents,bakingAllocations])
  const productionRemaining=useMemo(()=>planProduction(orders.map(o=>({id:o.id,status:o.status,items:o.orderItems??[]})),recipes).map(p=>({...p,baked:bakedTotals[p.recipe.id]??0,remaining:Math.max(0,Math.ceil(p.cans)-(bakedTotals[p.recipe.id]??0))})),[orders,recipes,bakedTotals])
  const requirements = useMemo(() => calculateRequirements(orders.map(o => ({ id: o.id, status: o.status, items: o.orderItems ?? [] })), recipes, stock,bakedTotals), [orders, recipes, stock,bakedTotals])
  const shortages = requirements.filter(r => r.shortage > 0)
  const urgentOrders = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled' && new Date(o.date).getTime() < Date.now() + 3 * 86400000)

  const searchTerm = search.trim().toLocaleLowerCase()
  const searchResults = useMemo(() => {
    if (!searchTerm) return []
    const results: { key: string; kind: string; title: string; detail: string; page: string }[] = []
    for (const order of orders) {
      if ([order.customer,order.id,order.items,order.status,order.method,order.date].some(v => v.toLocaleLowerCase().includes(searchTerm))) results.push({key:'order-'+order.id,kind:'Order',title:order.customer,detail:order.id+' · '+order.items+' · '+order.status,page:'Customer Orders'})
    }
    for (const recipe of recipes) {
      const ingredientNames = recipe.ingredients.map(i=>stock.find(x=>x.id===i.ingredientId)?.name??'')
      if ([recipe.name,...ingredientNames].some(v=>v.toLocaleLowerCase().includes(searchTerm))) results.push({key:'recipe-'+recipe.id,kind:'Recipe',title:recipe.name,detail:recipe.yieldPieces+' pcs / batch',page:'Biscuit Recipes'})
    }
    for (const ingredient of stock) {
      if ([ingredient.name,ingredient.unit].some(v=>v.toLocaleLowerCase().includes(searchTerm))) results.push({key:'ingredient-'+ingredient.id,kind:'Ingredient',title:bilingualIngredient(ingredient.name),detail:formatQuantity(ingredient.quantity,ingredient.unit)+' in stock',page:'Ingredient Inventory'})
    }
    return results.slice(0,30)
  },[searchTerm,orders,recipes,stock])
  const counts = { total: orders.length, pending: orders.filter(o => o.status === 'Pending').length, progress: orders.filter(o => o.status === 'In Progress').length, completed: orders.filter(o => o.status === 'Completed').length }

  function addOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const customer = String(data.get('customer') || 'New customer')
    const items = data.getAll('item').map(String)
    if (items.length === 0) { window.alert('Select at least one biscuit.'); return }
    const orderItems = items.map(item => ({ recipeId: recipes.find(r => r.name === item)?.id ?? '', cans: Number(data.get(`quantity-${item}`) || 1) }))
    if (orderItems.some(i => !i.recipeId || !Number.isInteger(i.cans) || i.cans < 1)) { alert('Select valid recipes and enter at least one whole can for each.'); return }
    const quantities = items.map((item) => `${item}: ${data.get(`quantity-${item}`) || 1} can(s)`)
    const dueDate = String(data.get('dueDate') || '')
    const formattedDueDate = dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Nov 06, 2026'
    setOrders([{ id: crypto.randomUUID(), customer, items: items.join(', ') || 'Peanut Biscuit', qty: quantities.join(' · ') || 'Peanut Biscuit: 1 can', date: formattedDueDate, status: 'Pending', method: 'Pickup', orderItems }, ...orders]); setShowAdd(false)
  }

  if (!client) return <div className="mx-auto mt-24 max-w-md rounded-xl border p-8"><h1 className="text-2xl font-bold">Supabase setup required</h1><p className="mt-3">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the development server.</p></div>
  if (!authChecked) return <div className="p-10">Checking login...</div>
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-[#f8f5f0] p-4 text-[#302923]"><form onSubmit={signIn} className="w-full max-w-md rounded-2xl border border-[#e7dcd2] bg-white p-7 text-[#302923] shadow-sm"><h1 className="font-serif text-2xl font-bold text-[#302923]">BiscuitFlow</h1><p className="mt-2 text-sm text-[#64574d]">Private admin login / 管理员登录</p><label className="mt-5 block text-sm font-medium text-[#45372e]">Email<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="mt-1 block w-full rounded-lg border border-[#c8b8a9] bg-white p-3 text-base text-[#302923] caret-[#302923] placeholder:text-[#817369] outline-none focus:border-[#8e5e42] focus:ring-2 focus:ring-[#8e5e42]/25"/></label><label className="mt-4 block text-sm font-medium text-[#45372e]">Password / 密码<input name="password" type="password" required autoComplete="current-password" placeholder="Enter your password" className="mt-1 block w-full rounded-lg border border-[#c8b8a9] bg-white p-3 text-base text-[#302923] caret-[#302923] placeholder:text-[#817369] outline-none focus:border-[#8e5e42] focus:ring-2 focus:ring-[#8e5e42]/25"/></label>{cloudError&&<p role="alert" className="mt-3 text-sm font-medium text-red-700">{cloudError}</p>}<button disabled={busy} className="mt-5 w-full rounded-lg bg-[#8e5e42] p-3 font-semibold text-white disabled:opacity-60">{busy?'Signing in...':'Sign in / 登录'}</button></form></div>
  if (!roleChecked) return <div className="p-10 text-[#302923]">Checking admin permissions...</div>
  if (!isAdmin) return <div className="mx-auto mt-20 max-w-md rounded-xl border bg-white p-8 text-[#302923]"><h1 className="text-xl font-bold">Admin access only</h1><p className="mt-3 text-sm">This account is not authorized to manage BiscuitFlow.</p><a className="mt-4 inline-block rounded bg-[#8e5e42] px-4 py-2 text-sm text-white" href="/order">Customer ordering page</a><button onClick={()=>client.auth.signOut()} className="ml-3 text-sm underline">Sign out</button></div>
  if (!hydrated) return <div className="p-10">{cloudError?<div role="alert" className="text-red-700">{cloudError}<button className="ml-4 underline" onClick={()=>location.reload()}>Retry</button></div>:'Loading your cloud data / 正在读取云端资料...'}</div>
  return <div className="min-h-screen bg-[#f8f5f0] text-[#302923]">
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-[#ebe4dc] bg-[#fffdf9] px-4 py-5 transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-3 px-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[#8e5e42] text-white shadow-sm"><Cookie /></div><div><div className="font-serif text-lg font-bold tracking-tight">BiscuitFlow</div><div className="text-[10px] font-medium uppercase tracking-[.16em] text-[#a58e7b]">{tr('Bakery operations')}</div></div></div>
      <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#b6a99d]">{tr('Workspace')}</div>
      <nav className="mt-3 flex flex-1 flex-col gap-1">{nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setMenuOpen(false) }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${active === label ? 'bg-[#f2e8df] text-[#7d4d34]' : 'text-[#81766d] hover:bg-[#f8f2eb] hover:text-[#54473e]'}`}><Icon className="size-[17px]" / >{tr(label)}{label === 'Notifications' && <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-[#bd6b48] text-[10px] font-bold text-white">3</span>}</button>)}</nav>
      <div className="rounded-2xl bg-[#f5eee7] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#7d4d34]"><Sparkles className="size-4" /> {tr('Good morning, Tan')}</div><p className="mt-2 text-[11px] leading-relaxed text-[#9a887b]">{tr('You have 3 orders to prepare this week.')}</p></div>
      <div className="mt-4 flex items-center gap-3 border-t border-[#eee7df] pt-4"><div className="flex size-9 items-center justify-center rounded-full bg-[#d7b29a] text-sm font-bold text-white">MS</div><div className="min-w-0"><div className="truncate text-xs font-semibold">Tan PS.</div><div className="text-[10px] text-[#a58e7b]">Administrator</div></div><ChevronDown className="ml-auto size-4 text-[#a58e7b]" /></div>
    </aside>
    {menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-black/20 lg:hidden" />}
    <main className="lg:ml-[250px]">
      <header className="sticky top-0 z-10 flex h-[74px] items-center justify-between border-b border-[#ebe4dc] bg-[#f8f5f0]/90 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 hover:bg-white lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button><div className="hidden text-sm text-[#a08e80] sm:block">Tuesday, October 27, 2026</div><div className="sm:hidden text-sm font-semibold">{tr(active)}</div></div><div className="flex items-center gap-3"><select aria-label="Language / 语言" value={language} onChange={e => setLanguage(e.target.value as 'en' | 'zh')} className="rounded-lg border border-[#e5dbd1] bg-white px-2 py-1.5 text-xs font-semibold"><option value="en">English</option><option value="zh">简体中文</option></select><div className="relative hidden md:block"><Search className="absolute left-3 top-2.5 size-4 text-[#b3a69b]" /><input aria-label={tr("Search orders, recipes...")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setSearch('');if(e.key==='Enter'&&searchResults[0]){setActive(searchResults[0].page);setSearch('')}}} placeholder={tr("Search orders, recipes...")} className="h-9 w-56 rounded-lg border border-[#e9e1d9] bg-white pl-9 pr-8 text-xs outline-none placeholder:text-[#b8ada3] focus:border-[#bd8b6d]" />{search&&<button aria-label="Clear search" onClick={()=>setSearch('')} className="absolute right-2 top-2.5"><X className="size-4"/></button>}
    {searchTerm&&<div className="absolute right-0 top-11 z-50 max-h-80 w-[min(90vw,380px)] overflow-y-auto rounded-xl border border-[#e9e1d9] bg-white p-2 shadow-xl" role="region" aria-label="Search results">{searchResults.length===0?<p className="p-3 text-xs text-[#978a7f]">{language==='zh'?'没有找到匹配结果':'No matching results'}</p>:searchResults.map(result=><button key={result.key} onClick={()=>{setActive(result.page);setSearch('')}} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f7f0e9]"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#a58e7b]">{result.kind==='Order'?(language==='zh'?'订单':'Order'):result.kind==='Recipe'?(language==='zh'?'配方':'Recipe'):(language==='zh'?'原材料':'Ingredient')}</span><div className="text-sm font-semibold">{result.title}</div><div className="truncate text-xs text-[#978a7f]">{result.detail}</div></button>)}</div>}
  </div><button type="button" aria-label={tr("Notifications")} title={tr("Notifications")} onClick={() => { setActive("Notifications"); setMenuOpen(false) }} className="relative rounded-lg p-2 text-[#88796d] hover:bg-white"><Bell className="size-[18px]" />{shortages.length + urgentOrders.length > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[#bd6b48]" />}</button><div className="hidden h-7 w-px bg-[#e6ded5] sm:block" /><button className="rounded-lg border border-[#e5dbd1] px-2 py-1.5 text-xs" onClick={()=>client.auth.signOut()}>Sign out / 登出</button><div className="flex size-8 items-center justify-center rounded-full bg-[#d7b29a] text-[11px] font-bold text-white">MS</div></div></header>
      <div className="mx-auto max-w-[1400px] p-5 sm:p-8">
        <div className="relative mb-5 md:hidden"><label className="mb-1 block text-xs font-semibold text-[#8e5e42]">{language==='zh'?'搜索订单、配方及原材料':'Search orders, recipes and ingredients'}</label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-[#b3a69b]"/><input value={search} onChange={e=>setSearch(e.target.value)} aria-label={tr("Search orders, recipes...")} placeholder={tr("Search orders, recipes...")} className="h-10 w-full rounded-lg border border-[#e9e1d9] bg-white pl-9 pr-9 text-sm outline-none"/>{search&&<button aria-label="Clear search" onClick={()=>setSearch('')} className="absolute right-3 top-3"><X className="size-4"/></button>}</div>{searchTerm&&<div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-white p-2 shadow-lg">{searchResults.length?searchResults.map(result=><button key={result.key} onClick={()=>{setActive(result.page);setSearch('')}} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f7f0e9]"><span className="text-xs font-semibold">{result.title}</span><div className="truncate text-xs text-[#978a7f]">{result.detail}</div></button>):<p className="p-3 text-xs text-gray-500">{language==='zh'?'没有找到匹配结果':'No matching results'}</p>}</div>}</div>{cloudError&&<div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{cloudError}</div>}
        {active === 'Dashboard' && (shortages.length > 0 || urgentOrders.length > 0) && <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mr-2 inline size-4" / >{language==='zh'?`${shortages.length} 种原材料缺货 · ${urgentOrders.length} 笔订单即将到期或已逾期。`:`${shortages.length} ingredient shortages · ${urgentOrders.length} orders due soon or overdue.`} <button className="ml-2 font-semibold underline" onClick={() => setActive('Ingredient Calculator')} >{language==='zh'?'查看原材料需求':'Review requirements'}</button></div>}
        {active === 'Dashboard' && <Dashboard counts={counts} orders={orders} setActive={setActive} />}
        {active === 'Customer Orders' && <OrdersPage orders={orders} contacts={guestContacts} setOrders={setOrders} onAdd={() => setShowAdd(true)} />}
        {active === 'Biscuit Recipes' && <RecipesPage recipes={recipes} setRecipes={setRecipes} stock={stock} />}
        {active === 'Ingredient Inventory' && <InventoryPage stock={stock} setStock={setStock} />}
        {active === 'Ingredient Calculator' && <CalculatorPage requirements={requirements} onShopping={() => setActive('Shopping List')} />}
        {active === 'Shopping List' && <ShoppingPage requirements={requirements} stock={stock} onReceive={receiveIngredient} shoppingItems={shoppingItems} setShoppingItems={setShoppingItems} />}
        {active === 'Production Planning' && <PlanningPage orders={orders} recipes={recipes} requirements={requirements} setActive={setActive} bakedTotals={bakedTotals} bakingEvents={bakingEvents} onRecord={recordBaking} saving={bakeSaving}/>}
        {active === 'Order Calendar' && <CalendarPage orders={orders} />}
        {active === 'Notifications' && <NotificationsPage orders={orders} requirements={requirements} productionRemaining={productionRemaining} onNavigate={setActive} />}
        {active === 'Settings' && <SettingsPage />}
      </div>
    </main>
    {showAdd && <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#39291f]/30 p-4"><form onSubmit={addOrder} className="w-full max-w-md rounded-2xl bg-[#fffdf9] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-xl font-bold">{tr("Add new order")}</h2><p className="mt-1 text-xs text-[#a08e80]">{tr("Create a customer order for your bakery.")}</p></div><button type="button" onClick={() => setShowAdd(false)} aria-label="Close"><X className="size-5 text-[#9e8d80]" /></button></div><div className="flex flex-col gap-4"><label className="text-xs font-semibold">{tr("Customer name")}<input name="customer" required className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm outline-none focus:border-[#bd8b6d]" placeholder="e.g. Sarah Lim" /></label><fieldset className="flex flex-col gap-2"><legend className="text-xs font-semibold">{tr("Biscuit types and quantities")}<span className="ml-1 font-normal text-[#a08e80]">(select each type and set its quantity)</span></legend>{recipes.map((recipe) => recipe.name).map((item) => <label key={item} className="flex items-center gap-2 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-xs"><input name="item" value={item} type="checkbox" className="accent-[#8e5e42]" /><span className="min-w-0 flex-1">{item}</span><input name={`quantity-${item}`} type="number" min="1" defaultValue="1" aria-label={`${item} cans`} className="h-8 w-20 rounded-md border border-[#e5dbd1] px-2 text-right text-xs outline-none focus:border-[#bd8b6d]" /><span className="text-[#a08e80]">cans</span></label>)}</fieldset><label className="text-xs font-semibold">{tr("Due date")}<input name="dueDate" type="date" required className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm outline-none focus:border-[#bd8b6d]" /></label><button className="mt-2 rounded-lg bg-[#8e5e42] py-2.5 text-sm font-semibold text-white hover:bg-[#744832]">{tr("Create order")}</button></div></form></div>}
  </div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { const {tr}=useLanguage(); return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#b08368]">{tr(eyebrow)}</div><h1 className="font-serif text-3xl font-bold tracking-tight text-[#352a24]">{tr(title)}</h1><p className="mt-1.5 text-sm text-[#978a7f]">{tr(description)}</p></div>{action}</div> }
function Dashboard({ counts, orders, setActive }: { counts: Record<string, number>; orders: Order[]; setActive: (v: string) => void }) { const {tr,language}=useLanguage(); const statCards: Array<[string, number, React.ComponentType<{ className?: string }>, string, string]> = [['Total orders', counts.total, TrendingUp, '+12.5%', 'text-[#8e5e42]'], ['Pending orders', counts.pending, Clock3, (language==='zh'?'本周有3笔到期':'3 due this week'), 'text-[#b17427]'], ['In progress', counts.progress, Factory, (language==='zh'?'进度正常':'On schedule'), 'text-[#5977a8]'], ['Completed', counts.completed, Check, (language==='zh'?'本月':'This month'), 'text-[#398361]']]; return <><PageHeading eyebrow="Tuesday, October 27" title={language==='zh'?'早安，Tan':'Good morning, Tan'} description={language==='zh'?'这是您的烘焙业务今日概况。':'Here’s what’s happening with your bakery today.'} action={<button onClick={() => setActive('Customer Orders')} className="flex items-center justify-center gap-2 rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#744832]"><Plus className="size-4" /> New order</button>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(([label, value, Icon, note, color]) => <div key={String(label)} className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5 shadow-[0_2px_10px_rgba(100,70,45,.03)]"><div className="flex items-start justify-between"><div className="text-xs font-medium text-[#978a7f]" >{tr(label as string)}</div><div className={`rounded-lg bg-[#f6efe8] p-2 ${color}`}><Icon className="size-4" /></div></div><div className="mt-4 flex items-end gap-2"><div className="font-serif text-3xl font-bold">{value as number}</div><div className="mb-1 text-[10px] font-semibold text-[#6b9a7d]" >{tr(note as string)}</div></div></div>)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">{language==='zh'?'即将到期的订单':'Upcoming orders'}</h2><p className="mt-1 text-xs text-[#a29285]">{language==='zh'?'查看即将到期的客户订单':'Your next customer deadlines'}</p></div><button onClick={() => setActive('Customer Orders')} className="text-xs font-semibold text-[#9b674b] hover:underline">{language==='zh'?'查看全部':'View all'}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-[#eee7df] text-[10px] font-bold uppercase tracking-wider text-[#b2a49a]"><th className="pb-3">{language==='zh'?'客户':'Customer'}</th><th className="pb-3">{language==='zh'?'订单':'Order'}</th><th className="pb-3">{tr("Due date")}</th><th className="pb-3">{tr("Status")}</th></tr></thead><tbody>{orders.slice(0, 4).map(o => <tr key={o.id} className="border-b border-[#f2ece6] last:border-0"><td className="py-3.5"><div className="text-sm font-semibold">{o.customer}</div><div className="text-[10px] text-[#ae9f93]">{o.id}</div></td><td className="py-3.5 text-xs text-[#776c63]">{o.items}</td><td className="py-3.5 text-xs font-medium">{o.date}</td><td className="py-3.5"><StatusPill status={o.status} /></td></tr>)}</tbody></table></div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-start justify-between"><div><h2 className="font-serif text-lg font-bold">{language==='zh'?'原材料库存状况':'Ingredient health'}</h2><p className="mt-1 text-xs text-[#a29285]">{language==='zh'?'当前库存水平':'Current stock levels'}</p></div><Package className="size-5 text-[#b08368]" /></div><div className="mt-5 flex items-end gap-3"><div className="font-serif text-4xl font-bold">75%</div><div className="mb-1 text-xs text-[#6b9a7d]">{language==='zh'?'库存状况良好':'Healthy stock'}</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f2ebe4]"><div className="h-full w-3/4 rounded-full bg-[#8eaa78]" /></div><div className="mt-5 flex flex-col gap-3">{ingredients.map(i => <div key={i.name} className="flex items-center justify-between"><div className="flex items-center gap-2.5"><span className={`size-2 rounded-full ${i.status === 'Good' ? 'bg-[#7fa56f]' : i.status === 'Low' ? 'bg-[#d49b43]' : 'bg-[#c46f61]'}`} /><span className="text-xs font-medium">{bilingualIngredient(i.name)}</span></div><div className="flex items-center gap-2"><span className="text-xs text-[#8d7f74]">{i.stock}</span><StatusPill status={i.status} /></div></div>)}</div></div></div><div className="mt-6 grid gap-6 md:grid-cols-2"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-center justify-between"><div><h2 className="font-serif text-lg font-bold">{language==='zh'?'订单动态':'Order activity'}</h2><p className="mt-1 text-xs text-[#a29285]">{language==='zh'?'过去7天的订单':'Orders over the last 7 days'}</p></div><span className="text-xs font-semibold text-[#6b9a7d]">+18.4%</span></div><div className="mt-6 flex h-32 items-end gap-3 px-2">{[42, 55, 38, 68, 58, 86, 74].map((height, i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className={`w-full rounded-t-md ${i === 5 ? 'bg-[#8e5e42]' : 'bg-[#dfc9b8]'}`} style={{ height: `${height}%` }} /><span className="text-[10px] text-[#b0a197]">{(language==='zh'?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'])[i]}</span></div>)}</div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#fff2dd] p-2 text-[#bd762c]"><AlertTriangle className="size-4" /></div><div><h2 className="font-serif text-lg font-bold">{language==='zh'?'需要注意的事项':'Needs your attention'}</h2><p className="mt-1 text-xs text-[#a29285]">{language==='zh'?'请在下次烘焙前处理':'Resolve these before your next bake'}</p></div></div><div className="mt-5 flex flex-col gap-3"><div className="flex items-center justify-between rounded-xl bg-[#fff8ed] p-3"><div><div className="text-xs font-semibold">{language==='zh'?'杏仁库存已用完':'Almond stock is empty'}</div><div className="mt-1 text-[10px] text-[#aa927b]">{language==='zh'?'影响 Benjamin Lee 的订单':'Affects Benjamin Lee’s order'}</div></div><button onClick={() => setActive('Shopping List')} className="text-[11px] font-bold text-[#a36514]">{language==='zh'?'立即采购':'Shop now'}</button></div><div className="flex items-center justify-between rounded-xl bg-[#f8f1eb] p-3"><div><div className="text-xs font-semibold">{language==='zh'?'黄油库存偏低':'Butter is running low'}</div><div className="mt-1 text-[10px] text-[#aa927b]">{language==='zh'?'低于最低库存量':'Below minimum threshold'}</div></div><button onClick={() => setActive('Ingredient Inventory')} className="text-[11px] font-bold text-[#8e5e42]">{language==='zh'?'查看':'Review'}</button></div></div></div></div></> }

function OrdersPage({ orders, contacts, setOrders, onAdd }: { orders: Order[]; contacts:Record<string,GuestContact>; setOrders: React.Dispatch<React.SetStateAction<Order[]>>; onAdd: () => void }) { const {tr}=useLanguage(); const [statusFilter,setStatusFilter]=useState<'All' | Status>('All'); const visibleOrders=orders.filter(o=>statusFilter==='All'||o.status===statusFilter); return <><PageHeading eyebrow="Workspace / Orders" title="Customer orders" description="Track every biscuit order from request to delivery." action={<button onClick={onAdd} className="flex items-center justify-center gap-2 rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="size-4" /> New order</button>} /><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2">{(['All','Pending','In Progress','Completed','Cancelled'] as const).map(status=><button key={status} type="button" aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${statusFilter===status?'bg-[#f2e8df] text-[#7d4d34]':'text-[#95877c] hover:bg-[#f8f2eb]'}`}>{status==='All'?tr('All orders'):tr(status)}</button>)}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left"><thead><tr className="border-b border-[#eee7df] text-[10px] font-bold uppercase tracking-wider text-[#b2a49a]"><th className="pb-3">Customer</th><th className="pb-3">Biscuit items</th><th className="pb-3">{tr("Quantity")}</th><th className="pb-3">Delivery date</th><th className="pb-3">{tr("Status")}</th><th /></tr></thead><tbody>{visibleOrders.map(o => <tr key={o.id} className="border-b border-[#f2ece6] last:border-0"><td className="py-4"><div className="text-sm font-semibold">{o.customer}</div><div className="text-[10px] text-[#ae9f93]">{o.id} · {o.method}</div>{contacts[o.id]&&<div className="mt-1 text-xs text-[#6c594d]">{contacts[o.id].phone} · {contacts[o.id].email}</div>}</td><td className="py-4 text-xs text-[#776c63]">{o.items}</td><td className="py-4 text-xs">{o.qty}</td><td className="py-4 text-xs font-medium">{o.date}</td><td className="py-4"><StatusPill status={o.status} />{o.shortage && <div className="mt-1 text-[10px] font-semibold text-[#bd6b48]">Ingredient shortage</div>}</td><td className="py-4 text-right"><select value={o.status} onChange={e => setOrders(prev => prev.map(item => item.id === o.id ? { ...item, status: e.target.value as Status } : item))} className="rounded-md border border-[#eee5dc] bg-transparent px-2 py-1 text-[11px] text-[#816e60]"><option value="Pending">{tr("Pending")}</option><option value="In Progress">{tr("In Progress")}</option><option value="Completed">{tr("Completed")}</option><option value="Cancelled">{tr("Cancelled")}</option></select></td></tr>)}{visibleOrders.length===0&&<tr><td colSpan={6} className="py-8 text-center text-sm text-[#95877c]">{tr("No orders found")}</td></tr>}</tbody></table></div></div></> }

function RecipesPage({ recipes, setRecipes, stock }: { recipes: Recipe[]; setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>; stock: StockItem[] }) { const {tr}=useLanguage();
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [yieldPieces, setYieldPieces] = useState(100)
  const [cansPerBatch,setCansPerBatch]=useState(1)
  const [published,setPublished]=useState(false)
  const [pricePerCan,setPricePerCan]=useState(0)
  const [parts, setParts] = useState<Recipe['ingredients']>([])
  function openEditor(recipe?: Recipe) {
    setEditing(recipe ?? null); setName(recipe?.name ?? ''); setYieldPieces(recipe?.yieldPieces ?? 100);setCansPerBatch(recipe?.cansPerBatch ?? 1);setPublished(recipe?.published??false);setPricePerCan(recipe?.pricePerCan??0)
    setParts(recipe?.ingredients.map(i => ({...i})) ?? []); setOpen(true)
  }
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || yieldPieces <= 0 || !Number.isInteger(yieldPieces) || cansPerBatch <= 0 || !Number.isInteger(cansPerBatch) || yieldPieces % cansPerBatch !== 0 || parts.length === 0 || parts.some(p => !p.ingredientId || p.quantity <= 0) || new Set(parts.map(p => p.ingredientId)).size !== parts.length) {
      alert('Enter a valid recipe: positive whole-number pieces and cans, pieces evenly divisible by cans, and unique ingredients with positive quantities.'); return
    }
    if(!Number.isFinite(pricePerCan)||pricePerCan<0||Math.round(pricePerCan*100)!==pricePerCan*100||(published&&pricePerCan<=0)){alert('Enter a valid price per can in RM (2 decimal places). Published biscuits must have a price greater than RM 0.');return}
    const record: Recipe = { id: editing?.id ?? crypto.randomUUID(), name: name.trim(), yieldPieces, cansPerBatch, published, pricePerCan, ingredients: parts }
    setRecipes(old => editing ? old.map(r => r.id === editing.id ? record : r) : [...old, record])
    setOpen(false)
  }
  return <><PageHeading eyebrow="Workspace / Recipes" title="Biscuit recipes" description="Saved recipes are used in live order ingredient calculations." action={<button onClick={() => openEditor()} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="mr-2 inline size-4"/>{tr("New recipe")}</button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{recipes.map(recipe => <div key={recipe.id} className="rounded-2xl border border-[#ebe3da] bg-white p-5"><Cookie className="mb-3 size-8 text-[#a87556]"/><h3 className="font-serif text-lg font-bold">{recipe.name}</h3><p className="mt-2 text-xs text-[#9b8b7f]"><p className="mt-1 text-sm font-semibold text-[#8e5e42]">RM {(recipe.pricePerCan??0).toFixed(2)} / can</p>{recipe.published?<span className="text-green-700">Publicly listed · </span>:<span className="text-gray-500">Private · </span>}Yields {recipe.yieldPieces} pieces / {recipe.cansPerBatch??1} cans · {getPiecesPerCan(recipe)} pieces/can · {recipe.ingredients.length} ingredients</p><div className="mt-3 space-y-1 text-xs">{recipe.ingredients.map(i => <p key={i.ingredientId}>{bilingualIngredient(stock.find(s => s.id === i.ingredientId)?.name ?? 'Unknown ingredient')}: {i.quantity} {i.unit}</p>)}</div><button onClick={() => openEditor(recipe)} className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold">{tr("Edit recipe")}</button></div>)}</div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex items-center justify-between"><h2 className="font-serif text-xl font-bold">{editing ? 'Edit recipe' : 'New recipe'}</h2><button type="button" onClick={() => setOpen(false)}><X/></button></div><label className="mt-5 block text-sm">Biscuit name<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></label><label className="mt-3 block text-sm">Pieces per batch<input required type="number" min="1" value={yieldPieces} onChange={e => setYieldPieces(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></label><label className="mt-3 block text-sm">Cans per batch<input required type="number" min="1" step="1" value={cansPerBatch} onChange={e=>setCansPerBatch(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></label><p className="mt-2 text-xs text-[#8b705a]">Example: 1000 pieces / 5 cans = 200 pieces per can. Enter whole numbers, and ensure pieces per batch is divisible by cans per batch.</p><label className="mt-3 block text-sm font-medium">Selling price per can (RM)<input required type="number" min="0" step="0.01" value={pricePerCan===0?"":pricePerCan} placeholder="e.g. 28.00" onChange={e=>setPricePerCan(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm" /></label><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/>List this biscuit on the public customer ordering page</label><h3 className="mt-5 font-semibold">Ingredients per batch</h3><div className="mt-3 space-y-3">{parts.map((part,i) => <div key={i} className="flex flex-wrap gap-2"><select aria-label="Ingredient" value={part.ingredientId} onChange={e => {const found=stock.find(s => s.id === e.target.value);setParts(old=>old.map((p,j)=>j===i?{...p,ingredientId:e.target.value,unit:found?.unit??'g'}:p))}} className="rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"><option value="">{tr("Select ingredient")}</option>{stock.map(item=><option key={item.id} value={item.id}>{bilingualIngredient(item.name)}</option>)}</select><input aria-label="Quantity" type="number" min="0.001" step="any" value={part.quantity} onChange={e=>setParts(old=>old.map((p,j)=>j===i?{...p,quantity:Number(e.target.value)}:p))} className="w-24 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><select aria-label="Unit" value={part.unit} onChange={e=>setParts(old=>old.map((p,j)=>j===i?{...p,unit:e.target.value as Unit}:p))} className="rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm">{(['g','kg','ml','L','pcs'] as Unit[]).map(u=><option key={u}>{u}</option>)}</select><button type="button" aria-label="Remove ingredient" onClick={()=>setParts(old=>old.filter((_,j)=>j!==i))}><X className="size-4"/></button></div>)}</div><button type="button" onClick={()=>setParts(old=>[...old,{ingredientId:'',quantity:1,unit:'g'}])} className="mt-4 rounded-lg border px-3 py-2 text-xs">+ Add ingredient</button><p className="mt-3 text-xs text-[#9b8b7f]">{tr("Add ingredients in Inventory first. Units must be compatible with their inventory units.")}</p><button type="submit" className="mt-5 block w-full rounded-lg bg-[#8e5e42] py-3 font-semibold text-white">{tr("Save recipe")}</button></form></div>}
  </>
}

function InventoryPage({ stock, setStock }: { stock: StockItem[]; setStock: React.Dispatch<React.SetStateAction<StockItem[]>> }) { const {tr}=useLanguage();
  const [name,setName]=useState(''); const [quantity,setQuantity]=useState(0); const [minimum,setMinimum]=useState(0); const [unit,setUnit]=useState<Unit>('g'); const [open,setOpen]=useState(false)
  function addCatalog() {
    const existing=new Set(stock.map(item=>item.name.trim().toLowerCase()))
    const additions=suggestedIngredients.filter(item=>!existing.has(item.name.toLowerCase()) && !(item.name==='Eggs' && existing.has('egg')))
    if(!additions.length){alert('All suggested ingredients already exist.');return}
    setStock(old=>[...old,...additions])
    alert(`Added ${additions.length} ingredients with 0 starting stock. Enter your actual quantities in Inventory.`)
  }
  function save(e:React.FormEvent) {e.preventDefault();if(!name.trim()||quantity<0||minimum<0||stock.some(s=>s.name.toLowerCase()===name.trim().toLowerCase())){alert('Enter a unique name and nonnegative amounts.');return}setStock(old=>[...old,{id:crypto.randomUUID(),name:name.trim(),quantity,minimum,unit}]);setOpen(false);setName('');setQuantity(0);setMinimum(0)}
  return <><PageHeading eyebrow="Workspace / Inventory" title="Ingredient inventory" description="Adjust stock here; requirements and shopping list update automatically." action={<div className="flex flex-wrap gap-2"><button onClick={addCatalog} className="rounded-lg border border-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-[#8e5e42]">Add suggested ingredients / 添加原材料清单</button><button onClick={()=>setOpen(true)} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="mr-2 inline size-4"/>{tr("Add ingredient")}</button></div>}/><div className="overflow-x-auto rounded-2xl border bg-white p-5"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs"><th className="py-3">{tr("Ingredient")}</th><th>{tr("Stock")}</th><th>{tr("Minimum")}</th><th>{tr("Status")}</th><th>{tr("Update available quantity")}</th></tr></thead><tbody>{stock.map(item=><tr key={item.id} className="border-b last:border-0"><td className="py-3 font-semibold">{bilingualIngredient(item.name)}</td><td>{formatQuantity(item.quantity,item.unit)}</td><td>{formatQuantity(item.minimum,item.unit)}</td><td><StatusPill status={item.quantity===0?'Out':item.quantity<item.minimum?'Low':'Good'}/></td><td><input aria-label={`Stock for ${item.name}`} type="number" step="any" min="0" value={item.quantity} onFocus={e=>e.currentTarget.select()} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0)setStock(old=>old.map(s=>s.id===item.id?{...s,quantity:value}:s))}} className="w-28 rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/></td></tr>)}</tbody></table></div>
  {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"><form onSubmit={save} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6"><h2 className="font-serif text-xl font-bold">{tr("Add ingredient")}</h2><input required placeholder="Ingredient name" value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><input type="number" min="0" step="any" placeholder="Available stock" value={quantity} onFocus={e=>e.currentTarget.select()} onChange={e=>setQuantity(Number(e.target.value))} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><input type="number" min="0" step="any" placeholder="Minimum stock" value={minimum} onFocus={e=>e.currentTarget.select()} onChange={e=>setMinimum(Number(e.target.value))} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm"/><select value={unit} onChange={e=>setUnit(e.target.value as Unit)} className="w-full rounded-lg border border-[#e5dbd1] bg-white px-3 py-2 text-sm">{(['g','kg','ml','L','pcs'] as Unit[]).map(u=><option key={u}>{u}</option>)}</select><div className="flex justify-end gap-3"><button type="button" onClick={()=>setOpen(false)}>{tr("Cancel")}</button><button className="rounded-lg bg-[#8e5e42] px-4 py-2 text-white">{tr("Save")}</button></div></form></div>}
  </>
}

function CalculatorPage({ requirements,onShopping }: { requirements: ReturnType<typeof calculateRequirements>; onShopping:()=>void }) { const {tr,language}=useLanguage();
  const used=requirements.filter(r=>r.required>0),missing=used.filter(r=>r.shortage>0)
  return <><PageHeading eyebrow="Workspace / Planning" title="Ingredient calculator" description="Calculated from saved recipes and all pending or in-progress orders." action={<button onClick={onShopping} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white">{tr("View shopping list")}</button>}/><div className="rounded-2xl border bg-white p-5">{missing.length>0?<p className="mb-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"><AlertTriangle className="mr-2 inline size-4"/>{missing.length} {language==='zh'?'种原材料库存不足':'insufficient ingredient(s)'}</p>:<p className="mb-5 text-sm text-green-700">{tr("No shortages for current orders.")}</p>}<div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b"><th className="py-3">{tr("Ingredient")}</th><th>{tr("Required")}</th><th>{tr("Available")}</th><th>{tr("Shortage")}</th></tr></thead><tbody>{used.map(r=><tr key={r.ingredient.id} className="border-b last:border-0"><td className="py-3 font-semibold">{bilingualIngredient(r.ingredient.name)}</td><td>{formatAlertQuantity(r.required,r.ingredient.unit)}</td><td>{formatAlertQuantity(r.available,r.ingredient.unit)}</td><td className={r.shortage>0?'font-bold text-red-700':'text-green-700'}>{formatAlertQuantity(r.shortage,r.ingredient.unit)}</td></tr>)}</tbody></table></div></div></>
}

function ShoppingPage({requirements,stock,onReceive,shoppingItems,setShoppingItems}:{requirements:ReturnType<typeof calculateRequirements>;stock:StockItem[];onReceive:(id:string,quantity:number,unit:Unit,shoppingId?:string)=>Promise<void>;shoppingItems:ShoppingItem[];setShoppingItems:React.Dispatch<React.SetStateAction<ShoppingItem[]>>}){
 const {language,tr}=useLanguage()
 const [ingredientId,setIngredientId]=useState('')
 const [amount,setAmount]=useState(1)
 const missing=requirements.filter(r=>r.shortage>0)
 const existing=stock.find(s=>s.id===ingredientId)
 function addManual(e:React.FormEvent){e.preventDefault();if(!existing||!Number.isFinite(amount)||amount<=0)return
  setShoppingItems(old=>[...old,{id:crypto.randomUUID(),ingredientId:existing.id,quantity:amount,unit:existing.unit}]);setAmount(1)
 }
 async function receive(id:string,quantity:number,unit:Unit,shoppingId?:string){
   if(!Number.isFinite(quantity)||quantity<=0)return
   try{await onReceive(id,quantity,unit,shoppingId)}catch(err){alert(err instanceof Error?err.message:'Stock receive failed')}
 }
 return <><PageHeading eyebrow="Workspace / Inventory" title="Shopping list" description={language==='zh'?'自动计算缺货量，可手动添加采购项目，收货后将数量加到原库存。':'Automatic shortages plus admin-added purchases. Receiving stock adds to existing inventory and recalculates warnings.'} action={<button onClick={()=>window.print()} className="rounded-lg border px-4 py-2 text-sm"><FileText className="mr-2 inline size-4"/>{tr("Print")}</button>}/>
 <div className="mb-5 rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">{language==='zh'?'手动添加采购项目':'Add an ingredient to the shopping list'}</h2><form onSubmit={addManual} className="flex flex-wrap items-end gap-3"><label className="flex-1 text-xs">{language==='zh'?'原材料':'Ingredient'}<select aria-label="Ingredient to purchase" required value={ingredientId} onChange={e=>setIngredientId(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm"><option value="">{language==='zh'?'选择原材料':'Select ingredient'}</option>{stock.map(i=><option key={i.id} value={i.id}>{bilingualIngredient(i.name)}</option>)}</select></label><label className="text-xs">{language==='zh'?'数量':'Quantity'} ({existing?.unit??(language==='zh'?'单位':'unit')})<input aria-label="Purchase quantity" required type="number" min="0.001" step="any" value={amount} onChange={e=>setAmount(Number(e.target.value))} className="mt-1 block w-32 rounded-lg border bg-white p-2 text-sm"/></label><button type="submit" className="rounded-lg bg-[#8e5e42] px-4 py-2 text-sm font-semibold text-white">{language==='zh'?'添加到清单':'Add to list'}</button></form><p className="mt-2 text-xs text-gray-500">{language==='zh'?'添加采购项目不会增加库存。购买后请点击收货，将数量加入现有库存。':'Adding a shopping item does not increase stock. Use Receive after purchase to add quantities to existing inventory.'}</p></div>
 <div className="mb-5 rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">{language==='zh'?'自动计算的缺货原材料':'Automatically calculated shortages'} ({missing.length})</h2>{missing.length===0?<p className="text-sm text-green-700">{tr("All current ingredient requirements can be met.")}</p>:<div className="space-y-3">{missing.map(r=><div key={r.ingredient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 p-4"><div><b>{bilingualIngredient(r.ingredient.name)}</b><p className="text-xs text-gray-600">{language==='zh'?'所需':'Required'} {formatAlertQuantity(r.required,r.ingredient.unit)} · {language==='zh'?'库存':'In stock'} {formatAlertQuantity(r.available,r.ingredient.unit)}</p></div><span className="font-semibold text-red-700">{language==='zh'?'仍缺少':'Still need'} {formatAlertQuantity(r.shortage,r.ingredient.unit)}</span><button onClick={()=>{const input=window.prompt((language==='zh'?'收到的数量 (':'Quantity received (')+r.ingredient.unit+')',String(Number(r.shortage.toFixed(3))));if(input===null)return;receive(r.ingredient.id,Number(input),r.ingredient.unit)}} className="rounded-lg bg-[#8e5e42] px-3 py-2 text-xs text-white">{language==='zh'?'收货入库':'Receive stock'}</button></div>)}</div>}</div>
 <div className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">{language==='zh'?'手动采购项目':'Admin shopping items'} ({shoppingItems.length})</h2>{shoppingItems.length===0?<p className="text-sm text-gray-500">{language==='zh'?'暂无手动添加的采购项目。':'No manually added shopping items.'}</p>:<div className="space-y-2">{shoppingItems.map(item=>{const ingredient=stock.find(i=>i.id===item.ingredientId);const requirement=requirements.find(r=>r.ingredient.id===item.ingredientId);return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><b className="text-sm">{bilingualIngredient(ingredient?.name??'Missing ingredient')}</b><p className="text-xs text-gray-500">{language==='zh'?'待购买':'To buy'}: {formatQuantity(item.quantity,item.unit)} · {language==='zh'?'当前库存':'Current'}: {ingredient?formatQuantity(ingredient.quantity,ingredient.unit):(language==='zh'?'无数据':'Unavailable')}{requirement&&requirement.shortage>0?(language==='zh'?' · 仍缺少：':' · Still short: ')+formatAlertQuantity(requirement.shortage,requirement.ingredient.unit):''}</p></div><div className="flex gap-2"><button disabled={!ingredient} onClick={()=>receive(item.ingredientId,item.quantity,item.unit,item.id)} className="rounded-lg bg-[#8e5e42] px-3 py-2 text-xs text-white disabled:opacity-50">{language==='zh'?'收货并加入库存':'Receive + add to stock'}</button><button onClick={()=>setShoppingItems(old=>old.filter(i=>i.id!==item.id))} className="rounded-lg border px-3 py-2 text-xs">{language==='zh'?'移除':'Remove'}</button></div></div>})}</div>}</div>
 </>
}

function PlanningPage({orders,recipes,requirements,setActive,bakedTotals,bakingEvents,onRecord,saving}:{orders:Order[];recipes:Recipe[];requirements:ReturnType<typeof calculateRequirements>;setActive:(page:string)=>void;bakedTotals:Record<string,number>;bakingEvents:BakingEvent[];onRecord:(recipeId:string,cans:number,note:string)=>Promise<void>;saving:boolean}){
 const {language}=useLanguage()
 const [selectedRecipe,setSelectedRecipe]=useState('')
 const [bakedCans,setBakedCans]=useState('')
 const [bakingNote,setBakingNote]=useState('')
 const [saveError,setSaveError]=useState('')
 const [saveSuccess,setSaveSuccess]=useState('')
 async function submitBaking(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setSaveError('');setSaveSuccess('');const n=Number(bakedCans);const batch=recipes.find(r=>r.id===selectedRecipe)?.cansPerBatch??1;if(!selectedRecipe||!Number.isInteger(n)||n<1||n>10000||n%batch!==0){setSaveError(language==='zh'?'请选择饼干，并按每批 '+batch+' 罐的倍数输入。':'Select a biscuit and enter whole batches (multiples of '+batch+' cans).');return}try{await onRecord(selectedRecipe,n,bakingNote);setSaveSuccess((language==='zh'?'已保存 ':'Saved ')+n+(language==='zh'?' 罐烘焙记录。':' baked can(s).'));setBakedCans('');setBakingNote('')}catch(err){setSaveError(err instanceof Error?err.message:'Unable to save production')}}
 const activeOrders=orders.filter(o=>o.status!=='Completed'&&o.status!=='Cancelled').sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
 const plans=planProduction(activeOrders.map(o=>({id:o.id,status:o.status,items:o.orderItems??[]})),recipes)
 const remaining=plans.map(p=>({...p,baked:bakedTotals[p.recipe.id]??0,remaining:Math.max(0,Math.ceil(p.cans)-(bakedTotals[p.recipe.id]??0))}))
 const short= requirements.filter(r=>r.shortage>0)
 return <><PageHeading eyebrow="Workspace / Production" title="Production planning" description={language==='zh'?'记录烘焙数量，已完成订单自动扣除，新的订单增加需求。':'Baked cans become available stock; completed orders consume cans and new orders increase demand.'} action={<button onClick={()=>setActive('Customer Orders')} className="rounded-lg bg-[#8e5e42] px-4 py-2.5 text-sm font-semibold text-white">{language==='zh'?'查看订单':'View orders'}</button>}/>
 {short.length>0&&<div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mr-2 inline size-4"/> {short.length} {language==='zh'?'种原材料库存不足，影响生产。':'ingredient shortage(s) affect production.'} <button className="ml-2 underline" onClick={()=>setActive('Shopping List')}>{language==='zh'?'打开采购清单':'Open shopping list'}</button></div>}
 <div className="mb-5 grid gap-3 sm:grid-cols-3">{[[(language==='zh'?'进行中的订单':'Active orders'),activeOrders.length],[(language==='zh'?'仍需制作（罐）':'Cans still needed'),remaining.reduce((a,p)=>a+p.remaining,0)],[(language==='zh'?'完整批次数':'Total full batches'),plans.reduce((a,p)=>a+p.batches,0)]].map(([name,value])=><div key={name} className="rounded-xl border bg-white p-4"><p className="text-xs text-[#998779]">{name}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</div>
 <div className="mb-5 rounded-2xl border bg-white p-5"><h2 className="font-serif text-lg font-bold">{language==='zh'?'记录已烘焙饼干':'Record baked biscuits'}</h2><p className="mt-1 text-xs text-gray-500">{language==='zh'?'烘焙记录会保存至 Supabase。系统按饼干种类计算可用罐数；记录烘焙将自动扣除原材料库存，但不会自动完成订单。':'Records are saved to Supabase. Baked cans are pooled by biscuit type and compared with active orders; recording deducts recipe ingredients atomically, but does not mark an order Completed.'}</p><form onSubmit={submitBaking} className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]"><label className="text-sm">{language==='zh'?'饼干种类':'Biscuit type'}<select required value={selectedRecipe} onChange={e=>setSelectedRecipe(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">{language==='zh'?'选择饼干':'Select biscuit'}</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><span className="text-xs text-gray-500">{language==='zh'?'每批罐数':'Cans per batch'}: {recipes.find(r=>r.id===selectedRecipe)?.cansPerBatch??'—'}</span></label><label className="text-sm">{language==='zh'?'已烘焙罐数':'Cans baked'}<input required type="number" min="1" max="10000" step="1" value={bakedCans} onChange={e=>setBakedCans(e.target.value)} className="mt-1 w-full rounded-lg border p-2" placeholder={language==='zh'?'按完整批次数填写':'Full batches only'}/></label><label className="text-sm sm:col-span-2">{language==='zh'?'备注（选填）':'Note (optional)'}<input maxLength={250} value={bakingNote} onChange={e=>setBakingNote(e.target.value)} className="mt-1 w-full rounded-lg border p-2" placeholder={language==='zh'?'早间烘焙批次':'Morning baking batch'}/></label><button type="submit" disabled={saving} className="rounded-lg bg-[#8e5e42] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?(language==='zh'?'保存中…':'Saving...'):(language==='zh'?'记录烘焙罐数':'Record baked cans')}</button></form>{saveError&&<p role="alert" className="mt-2 text-sm text-red-700">{saveError}</p>}{saveSuccess&&<p role="status" className="mt-2 text-sm text-green-700">{saveSuccess}</p>}</div>
 <div className="rounded-2xl border bg-white p-5"><h2 className="font-serif text-lg font-bold">{language==='zh'?'按饼干种类查看生产进度':'Production by biscuit type'}</h2><p className="mb-4 mt-1 text-xs text-[#96877b]">{language==='zh'?'生产批次向上取整以便规划；原材料需求按实际所需片数计算。':'Batches are rounded up for planning; ingredient demand is calculated from exact pieces required, not full rounded batches.'}</p>{plans.length===0?<p className="py-6 text-sm text-gray-500">{language==='zh'?'目前没有待生产的订单。':'No active orders to produce.'}</p>:<div className="space-y-3">{remaining.map(p=><div key={p.recipe.id} className="rounded-xl border p-4"><p className="font-semibold">{p.recipe.name}</p><p className="mt-1 text-sm">{language==='zh'?'订单需求':'Ordered'}: {p.cans} {language==='zh'?'罐':'cans'} · {language==='zh'?'已烘焙库存':'Available baked'}: {p.baked} {language==='zh'?'罐':'cans'} · <b className={p.remaining>0?'text-amber-700':'text-green-700'}>{language==='zh'?'仍需制作':'Still needed'}: {p.remaining} {language==='zh'?'罐':'cans'}</b></p><p className="text-xs text-gray-500">{p.pieces} {language==='zh'?'片':'pcs'} · {p.batches} {language==='zh'?'个预计批次':'full batch(es) estimated for demand'}</p><p className="mt-1 text-xs text-gray-500">{p.recipe.yieldPieces} {language==='zh'?'片':'pcs'} / {p.recipe.cansPerBatch??1} {language==='zh'?'罐／完整批次':'cans per full batch'}</p></div>)}</div>}</div>
 <div className="mt-5 rounded-2xl border bg-white p-5"><h2 className="mb-4 font-serif text-lg font-bold">{language==='zh'?'最近的烘焙记录':'Recent baking records'}</h2>{bakingEvents.length===0?<p className="text-sm text-gray-500">{language==='zh'?'尚无烘焙记录。':'No baking recorded yet.'}</p>:<div className="space-y-2">{bakingEvents.slice(0,10).map(e=><div key={e.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{recipes.find(r=>r.id===e.recipeId)?.name??(language==='zh'?'未知饼干':'Unknown biscuit')} · <b>{e.cans} {language==='zh'?'罐':'cans'}</b>{e.note&&<span className="text-xs text-gray-500"> · {e.note}</span>}</span><span className="text-xs text-gray-500">{new Date(e.bakedAt).toLocaleString()}</span></div>)}</div>}</div>
 <div className="mt-5 rounded-2xl border bg-white p-5"><h2 className="mb-4 font-serif text-lg font-bold">{language==='zh'?'按交货日期排列的订单':'Orders by delivery deadline'}</h2>{activeOrders.length===0?<p className="text-sm text-gray-500">{language==='zh'?'没有待处理的订单。':'No upcoming jobs.'}</p>:<div className="space-y-2">{activeOrders.map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b className="text-sm">{o.customer}</b><p className="text-xs text-gray-500">{o.qty} · {language==='zh'?'交货日期':'Due'} {o.date}</p></div><StatusPill status={o.status}/><button onClick={()=>setActive('Customer Orders')} className="rounded-lg border px-3 py-2 text-xs">{language==='zh'?'管理订单':'Manage order'}</button></div>)}</div>}</div></>
}
function CalendarPage({ orders }: { orders: Order[] }) {
 const today=new Date()
 const [month,setMonth]=useState(new Date(today.getFullYear(),today.getMonth(),1))
 const firstDay=new Date(month.getFullYear(),month.getMonth(),1).getDay()
 const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
 const dateKey=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
 const calendarOrders=orders.filter(o=>!Number.isNaN(new Date(o.date).getTime()))
 return <><PageHeading eyebrow="Workspace / Calendar" title="Order calendar" description="Live order deadlines. Refresh the page to retrieve newly submitted guest orders." action={<div className="flex items-center gap-2"><button onClick={()=>setMonth(d=>new Date(d.getFullYear(),d.getMonth()-1,1))} className="rounded-lg border px-3 py-2" aria-label="Previous month">‹</button><span className="px-2 text-sm font-semibold">{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span><button onClick={()=>setMonth(d=>new Date(d.getFullYear(),d.getMonth()+1,1))} className="rounded-lg border px-3 py-2" aria-label="Next month">›</button></div>}/>
 <div className="rounded-2xl border bg-white p-3"><div className="grid grid-cols-7 gap-1">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} className="py-2 text-center text-xs font-bold text-[#827264]">{d}</div>)}{Array.from({length:firstDay},(_,i)=><div key={'blank'+i}/>)}
 {Array.from({length:daysInMonth},(_,i)=>{const d=new Date(month.getFullYear(),month.getMonth(),i+1);const dayOrders=calendarOrders.filter(o=>dateKey(new Date(o.date))===dateKey(d));return <div key={i} className="min-h-20 rounded-lg border border-[#eee5dc] p-1.5 sm:min-h-28 sm:p-2"><div className="text-xs font-semibold">{i+1}</div>{dayOrders.map(o=><div key={o.id} className="mt-1 rounded bg-[#f4e7dc] p-1 text-[10px] text-[#694b38]"><div className="font-bold break-words">{o.customer}</div><div className="break-words">{o.qty}</div></div>)}</div>})}</div></div></>
}

function NotificationsPage({ orders, requirements, productionRemaining, onNavigate }: { orders: Order[]; requirements: ReturnType<typeof calculateRequirements>; productionRemaining:Array<{recipe:Recipe;remaining:number;baked:number;cans:number}>; onNavigate: (page:string)=>void }) {
  const {language,tr}=useLanguage()
  const [readKeys,setReadKeys]=useState<string[]>([])
  const [loaded,setLoaded]=useState(false)
  useEffect(()=>{try{const stored=localStorage.getItem('biscuitflow-read-alerts');if(stored)setReadKeys(JSON.parse(stored))}catch{}setLoaded(true)},[])
  function markRead(keys:string[]){setReadKeys(old=>{const next=Array.from(new Set([...old,...keys]));try{localStorage.setItem('biscuitflow-read-alerts',JSON.stringify(next))}catch{}return next})}
  const now=new Date()
  const notices=[
    ...productionRemaining.filter(p=>p.remaining>0).map(p=>({key:'baking:'+p.recipe.id+':'+p.remaining,title:language==='zh'?'尚需烘焙':'Baking still needed',message:language==='zh'?p.recipe.name+'：订单仍需制作 '+p.remaining+' 罐（目前可用已烘焙库存 '+p.baked+' 罐）。':p.recipe.name+': '+p.remaining+' can(s) still needed for active orders ('+p.baked+' available baked).',type:'production'})),
    ...requirements.filter(r=>r.shortage>0).map(r=>({key:'stock:'+r.ingredient.id+':'+r.shortage.toFixed(3),title:language==='zh'?'原材料不足':'Ingredient shortage',message:language==='zh'?bilingualIngredient(r.ingredient.name)+' 缺少 '+formatAlertQuantity(r.shortage,r.ingredient.unit)+'，请及时补货。':bilingualIngredient(r.ingredient.name)+' is short by '+formatAlertQuantity(r.shortage,r.ingredient.unit)+'. Please restock.',type:'stock'})),
    ...orders.filter(o=>o.status!=='Completed'&&o.status!=='Cancelled').flatMap(o=>{
      const deadline=new Date(o.date)
      if(Number.isNaN(deadline.getTime()))return []
      const days=Math.ceil((new Date(deadline.getFullYear(),deadline.getMonth(),deadline.getDate()).getTime()-new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime())/86400000)
      if(days>3)return []
      const due=days<0?(language==='zh'?'已逾期':'Overdue'):days===0?(language==='zh'?'今日到期':'Due today'):(language==='zh'?days+' 天后到期':'Due in '+days+' day(s)')
      return [{key:'due:'+o.id+':'+days,title:due,message:o.customer+' · '+o.items+' · '+o.date,type:'order'}]
    })
  ]
  return <><PageHeading eyebrow="Workspace / Alerts" title="Notifications" description={language==='zh'?'根据当前订单与库存计算的提醒。':'Alerts calculated from your current orders and ingredient stock.'} action={<button onClick={()=>markRead(notices.map(n=>n.key))} className="text-xs font-semibold text-[#98644a]">{tr("Mark all as read")}</button>}/>
  {notices.length===0?<div className="rounded-2xl border border-[#ebe3da] bg-white p-8 text-center text-sm text-[#81766d]">{language==='zh'?'目前没有库存不足或临近期限的订单提醒。':'No shortages or upcoming deadline alerts.'}</div>:<div className="flex flex-col gap-3">{notices.map(n=><div key={n.key} className="flex items-start gap-4 rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><div className="rounded-xl bg-[#fff0df] p-2.5 text-[#ba762b]">{n.type==='stock'?<AlertTriangle className="size-4"/>:<Clock3 className="size-4"/>}</div><div className="flex-1"><h3 className="text-sm font-semibold">{n.title}{loaded&&!readKeys.includes(n.key)&&<span className="ml-2 inline-block size-2 rounded-full bg-[#bd6b48]"/>}</h3><p className="mt-1.5 text-xs text-[#8f8176]">{n.message}</p><button onClick={()=>onNavigate(n.type==='stock'?'Ingredient Calculator':n.type==='production'?'Production Planning':'Customer Orders')} className="mt-2 text-xs font-semibold text-[#8e5e42] underline">{language==='zh'?'查看详情':'View details'}</button></div><button type="button" aria-label={language==='zh'?'标为已读':'Mark as read'} title={language==='zh'?'标为已读':'Mark as read'} onClick={()=>markRead([n.key])} className="rounded p-2 text-[#aa9b8f] hover:bg-[#f8f2eb]"><Check className="size-4"/></button></div>)}</div>}</>
}

function SettingsPage() { const {tr}=useLanguage(); return <><PageHeading eyebrow="Workspace / Preferences" title="Settings" description="Tune BiscuitFlow to match the way your bakery works." /><div className="grid gap-6 xl:grid-cols-2"><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><h2 className="font-serif text-lg font-bold">{tr("Business profile")}</h2><p className="mt-1 text-xs text-[#a29285]">The details customers see on your order records.</p><div className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">{tr("Business name")}<input defaultValue="Tan&apos;s Home Bakery" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm" /></label><label className="text-xs font-semibold">{tr("Currency")}<select defaultValue="MYR" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm"><option>MYR — Malaysian Ringgit</option><option>USD — US Dollar</option></select></label></div></div><div className="rounded-2xl border border-[#ebe3da] bg-[#fffdf9] p-5"><h2 className="font-serif text-lg font-bold">{tr("Deadline reminders")}</h2><p className="mt-1 text-xs text-[#a29285]">Choose when BiscuitFlow should call attention to orders.</p><div className="mt-5 flex flex-col gap-4"><label className="text-xs font-semibold">Due soon threshold<select defaultValue="3 days" className="mt-1.5 h-10 w-full rounded-lg border border-[#e5dbd1] bg-white px-3 text-sm"><option>3 days before</option><option>5 days before</option><option>7 days before</option></select></label><label className="flex items-center justify-between rounded-xl bg-[#f7f0e9] p-3.5 text-xs font-semibold">Show low stock warnings <input type="checkbox" defaultChecked className="size-4 accent-[#8e5e42]" /></label></div></div></div></> }
