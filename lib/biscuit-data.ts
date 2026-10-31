export type Unit = 'g' | 'kg' | 'ml' | 'L' | 'pcs'
export type StockItem = { id: string; name: string; quantity: number; minimum: number; unit: Unit }
export type RecipeIngredient = { ingredientId: string; quantity: number; unit: Unit }
export type Recipe = { id: string; name: string; yieldPieces: number; cansPerBatch?: number; published?: boolean; pricePerCan?: number; ingredients: RecipeIngredient[] }
export type OrderItem = { recipeId: string; pieces?: number; cans?: number }
export type DemandOrder = { id: string; status: string; items: OrderItem[] }
export type Requirement = { ingredient: StockItem; required: number; available: number; shortage: number; orderIds: string[] }

const factors: Record<Unit, number> = { g: 1, kg: 1000, ml: 1, L: 1000, pcs: 1 }
function dimension(unit: Unit) { return unit === 'g' || unit === 'kg' ? 'mass' : unit === 'ml' || unit === 'L' ? 'volume' : 'count' }
export function convert(quantity: number, from: Unit, to: Unit): number {
  if (dimension(from) !== dimension(to)) throw new Error(`Cannot convert ${from} to ${to}`)
  return quantity * factors[from] / factors[to]
}
export function calculateRequirements(orders: DemandOrder[], recipes: Recipe[], inventory: StockItem[], availableBaked:Record<string,number>={}): Requirement[] {
  const totals = new Map<string,{amount:number;orders:Set<string>}>()
  const outstanding = planProduction(orders,recipes)
  for(const plan of outstanding){
    const recipe=plan.recipe
    const unbakedCans=Math.max(0,Math.ceil(plan.cans)-(availableBaked[recipe.id]??0))
    if(!unbakedCans)continue
    const batches=Math.ceil(unbakedCans/(recipe.cansPerBatch||1))
    for(const part of recipe.ingredients){
      const stock=inventory.find(i=>i.id===part.ingredientId)
      if(!stock)continue
      const amount=convert(part.quantity*batches,part.unit,stock.unit)
      const total=totals.get(stock.id)??{amount:0,orders:new Set<string>()}
      total.amount+=amount
      plan.orderIds.forEach(id=>total.orders.add(id))
      totals.set(stock.id,total)
    }
  }
  return inventory.map(ingredient=>{
    const entry=totals.get(ingredient.id)
    const required=entry?.amount??0
    return {ingredient,required,available:ingredient.quantity,shortage:Math.max(0,required-ingredient.quantity),orderIds:[...(entry?.orders??[])]}
  })
}
export const sampleStock: StockItem[] = [
  { id: 'peanut', name: 'Peanut', quantity: 800, minimum: 500, unit: 'g' },
  { id: 'flour', name: 'Flour', quantity: 5, minimum: 1, unit: 'kg' },
  { id: 'butter', name: 'Butter', quantity: 420, minimum: 500, unit: 'g' },
  { id: 'almond', name: 'Almond', quantity: 0, minimum: 300, unit: 'g' },
  { id: 'sugar', name: 'Sugar', quantity: 2400, minimum: 500, unit: 'g' },
  { id: 'egg', name: 'Egg', quantity: 30, minimum: 10, unit: 'pcs' },
]
export const sampleRecipes: Recipe[] = [
  { id: 'peanut-recipe', name: 'Peanut Biscuit', yieldPieces: 100, ingredients: [{ ingredientId: 'peanut', quantity: 500, unit: 'g' }, { ingredientId: 'flour', quantity: 300, unit: 'g' }, { ingredientId: 'sugar', quantity: 150, unit: 'g' }, { ingredientId: 'butter', quantity: 200, unit: 'g' }, { ingredientId: 'egg', quantity: 2, unit: 'pcs' }] },
  { id: 'butter-recipe', name: 'Butter Cookies', yieldPieces: 80, ingredients: [{ ingredientId: 'butter', quantity: 240, unit: 'g' }, { ingredientId: 'flour', quantity: 400, unit: 'g' }, { ingredientId: 'sugar', quantity: 100, unit: 'g' }] },
  { id: 'almond-recipe', name: 'Almond Biscuit', yieldPieces: 60, ingredients: [{ ingredientId: 'almond', quantity: 300, unit: 'g' }, { ingredientId: 'flour', quantity: 250, unit: 'g' }] },
  { id: 'chocolate-recipe', name: 'Chocolate Chip', yieldPieces: 100, ingredients: [{ ingredientId: 'flour', quantity: 300, unit: 'g' }, { ingredientId: 'butter', quantity: 150, unit: 'g' }] },
]

// Catalog quantities start at zero because actual stock has not been provided.
// Eggs use pcs; liquids use ml; other ingredients use g.

const ingredientChinese:Record<string,string> = {
 "Butter": "黄油",
 "Sugar": "白糖",
 "Cake Flour": "低筋面粉",
 "Bread Flour": "高筋面粉",
 "Macadamia": "夏威夷果",
 "Dark Chocolate": "黑巧克力",
 "Pineapple Paste": "黄梨馅",
 "Eggs": "鸡蛋",
 "Peanut": "花生",
 "Peanut Oil": "花生油",
 "Red Fermented Beancurd": "南乳",
 "Maltose": "麦芽糖",
 "Sesame Seed": "芝麻",
 "Candied Wintermelon": "糖冬瓜",
 "Vegetable Oil": "植物油",
 "White Pepper Powder": "白胡椒粉",
 "Five Spice Powder": "五香粉",
 "Brown Sugar": "红糖",
 "Peanut Jam": "花生酱",
 "Peanut Powder": "花生粉",
 "Milk": "牛奶",
 "Ground Almonds": "杏仁碎",
 "Superfine Flour": "特幼面粉",
 "Potato Starch": "马铃薯淀粉",
 "Icing Sugar": "糖粉",
 "Cornflakes": "玉米片",
 "Oats": "燕麦",
 "Cranberries": "蔓越莓",
 "Almond Powder": "杏仁粉",
 "Cocoa Powder": "可可粉",
 "Dark Chocolate Chip": "黑巧克力豆",
 "Walnut": "核桃"
}
export function bilingualIngredient(name:string):string {
 const base=name.trim().replace(/\s*[（(][\u4e00-\u9fff]+[）)]\s*$/u,'')
 const chinese=ingredientChinese[base.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())]??Object.entries(ingredientChinese).find(([en])=>en.toLowerCase()===base.toLowerCase())?.[1]
 return chinese?`${base} (${chinese})`:name
}

export const suggestedIngredients: StockItem[] = [
  ['Butter','g'],['Sugar','g'],['Cake Flour','g'],['Bread Flour','g'],
  ['Macadamia','g'],['Dark Chocolate','g'],['Pineapple Paste','g'],['Eggs','pcs'],
  ['Peanut','g'],['Peanut Oil','ml'],['Red Fermented Beancurd','g'],['Maltose','g'],
  ['Sesame Seed','g'],['Candied Wintermelon','g'],['Vegetable Oil','ml'],
  ['White Pepper Powder','g'],['Five Spice Powder','g'],['Brown Sugar','g'],
  ['Peanut Jam','g'],['Peanut Powder','g'],['Milk','ml'],['Ground Almonds','g'],
  ['Superfine Flour','g'],['Potato Starch','g'],['Icing Sugar','g'],['Cornflakes','g'],
  ['Oats','g'],['Cranberries','g'],['Almond Powder','g'],['Cocoa Powder','g'],
  ['Dark Chocolate Chip','g'],['Walnut','g']
].map(([name,unit])=>({
 id:'catalog-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),
 name,quantity:0,minimum:0,unit:unit as Unit
}))
/** Human-friendly display for shortages: prefer kg, L and pieces without altering stored units. */
export function formatAlertQuantity(quantity:number,unit:Unit):string {
 if(!Number.isFinite(quantity))return '—'
 const value=unit==='g'?quantity/1000:unit==='ml'?quantity/1000:quantity
 const displayUnit=unit==='g'?'kg':unit==='ml'?'L':unit==='pcs'?'pieces':unit
 const formatted=new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(Number(value.toFixed(4)))
 return `${formatted} ${displayUnit}`
}

export function formatQuantity(quantity:number, unit:Unit):string {
  if(!Number.isFinite(quantity))return '—'
  const rounded=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(Number(n.toFixed(3)))
  if(unit==='g'&&Math.abs(quantity)>=1000)return `${rounded(quantity/1000)} kg`
  if(unit==='ml'&&Math.abs(quantity)>=1000)return `${rounded(quantity/1000)} L`
  return `${rounded(quantity)} ${unit}`
}

export function getPiecesPerCan(recipe: Recipe): number {
  return recipe.yieldPieces / (recipe.cansPerBatch || 1)
}
export function planProduction(orders: DemandOrder[], recipes: Recipe[]) {
  const demands = new Map<string,{recipe:Recipe,cans:number,pieces:number,orderIds:string[]}>()
  for (const order of orders) {
    if(order.status==='Completed'||order.status==='Cancelled')continue
    for(const item of order.items){
      const recipe=recipes.find(r=>r.id===item.recipeId)
      if(!recipe)continue
      const pieces=item.cans!==undefined ? item.cans*getPiecesPerCan(recipe) : (item.pieces??0)
      const cans=item.cans!==undefined ? item.cans : pieces/getPiecesPerCan(recipe)
      if(!Number.isFinite(pieces)||pieces<=0)continue
      const row=demands.get(recipe.id)??{recipe,cans:0,pieces:0,orderIds:[]}
      row.pieces+=pieces;row.cans+=cans
      if(!row.orderIds.includes(order.id))row.orderIds.push(order.id)
      demands.set(recipe.id,row)
    }
  }
  return [...demands.values()].map(row=>({...row,batches:Math.ceil(row.pieces/row.recipe.yieldPieces)}))
}
