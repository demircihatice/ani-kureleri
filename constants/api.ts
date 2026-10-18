// Yeni şema ve API hazırlandıktan sonra açıkça etkinleştirilir; varsayılan eski okuma akışıdır.
export function memoryApiEtkin(): boolean {
  return process.env.EXPO_PUBLIC_MEMORY_API_ENABLED === 'true' && !!process.env.EXPO_PUBLIC_API_URL?.trim();
}
export function simulasyonGorunur(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ANALYSIS_SIMULATION_ENABLED === 'true';
}
