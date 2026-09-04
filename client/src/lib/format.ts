const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatINR(amount: number): string {
  return inr.format(amount)
}

export function formatINRPrecise(amount: number): string {
  return inrPrecise.format(amount)
}

export function formatKg(kg: number): string {
  return `${kg.toFixed(1)} kg`
}

export function pluralDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}