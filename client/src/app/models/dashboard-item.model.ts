export interface DashboardItem {
  id: number;
  title: string;
  status: 'Actif' | 'En attente' | 'Terminé';
  coverage: number;
  lastUpdate: string;
}