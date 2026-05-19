export const APP = {
  version: 'Rebuilt-V1.0.0',
  dbName: 'AZ_CAT_REBUILT_DB',
  dbVersion: 1,
  activeMemoryId: localStorage.getItem('az_cat_active_memory_id') || '',
  activeMemoryName: '',
  sourceSegments: [],
  results: [],
  page: 1,
  pageSize: 80,
  worker: null,
  analyzing: false
};
