import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPA_URL = 'https://hlxdtvnohciudbxjpsfx.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhseGR0dm5vaGNpdWRieGpwc2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDU3ODMsImV4cCI6MjA4ODIyMTc4M30.zN48AOM36ZPkbJ0mryai_ZQALLQxZFYaI-A-FbugWmI';
export const sb = createClient(SUPA_URL, SUPA_KEY);

export const COLORS = [
  '#351cd4','#fc5c7c','#5cfca4','#fcb45c',
  '#5cb4fc','#fc5cdc','#fcdc5c','#5cfce8',
  '#ff8c5c','#a8fc5c',
];

export const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
