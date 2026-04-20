/* ================================================================
   ERA-VIS AI v2.0 — sampleData.js
   Data sample hardcoded untuk testing Weekly Report Generator
   Ganti dengan API call ke Google Apps Script saat production
   ================================================================ */
'use strict';

const SAMPLE_CAMPAIGNS = [
  {
    id: 1,
    campaign_name: 'WOBBLER AKSESORIS',
    campaign_type: 'WOBBLER',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    total_stores: 136,
    stores_done: 60,
    stores_not_done: 76,
    completion_rate: 46,
    region: 'REGION 5',
    status: 'ACTIVE',
    priority: 'HIGH',
  },
  {
    id: 2,
    campaign_name: 'SIGNBOARD OPPO A6X',
    campaign_type: 'SIGNBOARD',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    total_stores: 92,
    stores_done: 0,
    stores_not_done: 92,
    completion_rate: 0,
    region: 'ALL_REGIONS',
    status: 'ACTIVE',
    priority: 'URGENT',
  },
  {
    id: 3,
    campaign_name: 'HANGING MOBILE SAMSUNG S26',
    campaign_type: 'HANGING',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    total_stores: 92,
    stores_done: 1,
    stores_not_done: 91,
    completion_rate: 1,
    region: 'ALL_REGIONS',
    status: 'ACTIVE',
    priority: 'URGENT',
  },
  {
    id: 4,
    campaign_name: 'SIGNBOARD LOW MID',
    campaign_type: 'SIGNBOARD',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    total_stores: 92,
    stores_done: 0,
    stores_not_done: 92,
    completion_rate: 0,
    region: 'ALL_REGIONS',
    status: 'ACTIVE',
    priority: 'MEDIUM',
  },
  {
    id: 5,
    campaign_name: 'EASEL LEBARAN APPLE',
    campaign_type: 'EASEL',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    total_stores: 31,
    stores_done: 31,
    stores_not_done: 0,
    completion_rate: 100,
    region: 'ERAFONE_ONLY',
    status: 'COMPLETED',
    priority: 'LOW',
  },
];

const SAMPLE_STORES_NOT_DONE = [
  { id: 1,  campaign_id: 1, region: 'REGION 5', plant_code: 'E259', store_name: 'ERAFONE RUKO KELAPA DUA TANGERANG',    city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 7,  last_reminder: '2026-04-12' },
  { id: 2,  campaign_id: 1, region: 'REGION 5', plant_code: 'E308', store_name: 'ERAFONE RUKO MAYOR SAFEI',             city: 'SERANG',             area: 'TANGERANG', days_overdue: 7,  last_reminder: '2026-04-12' },
  { id: 3,  campaign_id: 1, region: 'REGION 5', plant_code: 'E369', store_name: 'ERAFONE RUKO BOROBUDURTANGERANG',      city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 7,  last_reminder: '2026-04-12' },
  { id: 4,  campaign_id: 1, region: 'REGION 5', plant_code: 'E417', store_name: 'ERAFONE RUKO HASYIM ASYARI CILEDUG',   city: 'TANGERANG SELATAN',  area: 'TANGERANG', days_overdue: 4,  last_reminder: '2026-04-15' },
  { id: 5,  campaign_id: 1, region: 'REGION 5', plant_code: 'E420', store_name: 'ERAFONE RUKO CEMPAKA PUTIH',           city: 'JAKARTA PUSAT',      area: 'JAKARTA',   days_overdue: 9,  last_reminder: '2026-04-10' },
  { id: 6,  campaign_id: 1, region: 'REGION 5', plant_code: 'E696', store_name: 'ERAFONE MB RASUNA SAID',               city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 1,  last_reminder: '2026-04-18' },
  { id: 7,  campaign_id: 1, region: 'REGION 5', plant_code: 'E705', store_name: 'ERAFONE MB CIATER TANGSEL',            city: 'TANGERANG SELATAN',  area: 'TANGERANG', days_overdue: 1,  last_reminder: '2026-04-18' },
  { id: 8,  campaign_id: 1, region: 'REGION 5', plant_code: 'E777', store_name: 'ERAFONE MB CIHUNI PAGEDANGAN',         city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 2,  last_reminder: '2026-04-17' },
  { id: 9,  campaign_id: 1, region: 'REGION 5', plant_code: 'E787', store_name: 'ERAFONE MB RUKOTJGARAKSA',             city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 19, last_reminder: null },
  { id: 10, campaign_id: 1, region: 'REGION 5', plant_code: 'E874', store_name: 'ERAFONE MB DASANA INDAH',              city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 19, last_reminder: null },
  { id: 11, campaign_id: 1, region: 'REGION 5', plant_code: 'F022', store_name: 'ERAFONE 2.5 PAMULANG',                 city: 'TANGERANG SELATAN',  area: 'TANGERANG', days_overdue: 3,  last_reminder: '2026-04-16' },
  { id: 12, campaign_id: 1, region: 'REGION 5', plant_code: 'M132', store_name: 'MEGASTORE GROGOL PTAMBURAN',           city: 'JAKARTA BARAT',      area: 'JAKARTA',   days_overdue: 5,  last_reminder: '2026-04-14' },
  { id: 13, campaign_id: 1, region: 'REGION 5', plant_code: 'M167', store_name: 'ERAFONE & MORE TELUK NAGA',            city: 'TANGERANG',          area: 'TANGERANG', days_overdue: 6,  last_reminder: '2026-04-13' },
  { id: 14, campaign_id: 1, region: 'REGION 5', plant_code: 'T001', store_name: 'ERAFONE MAL TAMAN ANGGREK 3.0',        city: 'JAKARTA BARAT',      area: 'JAKARTA',   days_overdue: 8,  last_reminder: '2026-04-11' },
];

const SAMPLE_REGIONAL_SUMMARY = [
  {
    region: 'REGION 5',
    region_name: 'Jakarta - Tangerang - Banten',
    total_stores: 300,
    stores_done: 235,
    stores_not_done: 65,
    completion_rate: 78,
    campaigns_active: 8,
  },
  {
    region: 'REGION 3',
    region_name: 'Banten',
    total_stores: 137,
    stores_done: 89,
    stores_not_done: 48,
    completion_rate: 65,
    campaigns_active: 6,
  },
];

const SAMPLE_OVERVIEW_STATS = {
  total_campaigns_active: 8,
  overall_completion_rate: 72,
  total_stores_not_done: 156,
  total_stores: 542,
  last_updated: '2026-04-19T23:27:48',
  top_urgent_campaigns: [
    { campaign_name: 'WOBBLER AKSESORIS',         completion_rate: 46, stores_not_done: 76,  total_stores: 136, priority_level: 'HIGH'   },
    { campaign_name: 'SIGNBOARD OPPO A6X',         completion_rate: 0,  stores_not_done: 92,  total_stores: 92,  priority_level: 'URGENT' },
    { campaign_name: 'HANGING MOBILE SAMSUNG S26', completion_rate: 1,  stores_not_done: 91,  total_stores: 92,  priority_level: 'URGENT' },
  ],
};
