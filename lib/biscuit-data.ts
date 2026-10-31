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
export function calculateRequirements(orders: DemandOrder[], recipes: Recipe[], inventory: StockItem[]): Requirement[] {
  const totals = new Map<string, { amount: number; orders: Set<string> }>()
  for (const order of orders) {
    if (order.status === 'Completed' || order.status === 'Cancelled') continue
    for (const item of order.items) {
      const recipe = recipes.find(r => r.id === item.recipeId)
      if (!recipe || recipe.yieldPieces <= 0) continue
      const pieces = item.cans !== undefined ? item.cans * (recipe.yieldPieces / (recipe.cansPerBatch || 1)) : (item.pieces ?? 0)
      if (!Number.isFinite(pieces) || pieces <= 0) continue
      for (const component of recipe.ingredients) {
        const stock = inventory.find(i => i.id === component.ingredientId)
        if (!stock) continue
        const amount = convert(component.quantity * pieces / recipe.yieldPieces, component.unit, stock.unit)
        const total = totals.get(stock.id) ?? { amount: 0, orders: new Set<string>() }
        total.amount += amount
        total.orders.add(order.id)
        totals.set(stock.id, total)
      }
    }
  }
  return inventory.map(ingredient => {
    const entry = totals.get(ingredient.id)
    const required = entry?.amount ?? 0
    return { ingredient, required, available: ingredient.quantity, shortage: Math.max(0, required - ingredient.quantity), orderIds: [...(entry?.orders ?? [])] }
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
