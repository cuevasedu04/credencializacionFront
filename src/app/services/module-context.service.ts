import { Injectable, computed, signal } from '@angular/core';

export type SidebarBlock = 'anam' | 'nuevo-laredo' | 'consultas' | null;

@Injectable({ providedIn: 'root' })
export class ModuleContextService {
  private readonly _selectedBlock = signal<SidebarBlock>(null);
  readonly selectedBlock = this._selectedBlock.asReadonly();

  readonly hasSelection = computed(() => this._selectedBlock() !== null);

  setBlock(block: SidebarBlock): void {
    this._selectedBlock.set(block);
  }

  clearBlock(): void {
    this._selectedBlock.set(null);
  }

  getAllowedIds(block: SidebarBlock): string[] {
    switch (block) {
      case 'anam':
        return ['enrolamiento', 'plantilla-anam'];
      case 'nuevo-laredo':
        return ['enrolamiento', 'provisional', 'familiar'];
      case 'consultas':
        return ['busquedaAvanzada', 'reportes', 'credencializacion', 'Carga masiva'];
      default:
        return [];
    }
  }

  resolveBlockFromRoute(url: string): SidebarBlock {
    if (url.includes('/busqueda-avanzada') || url.includes('/reportes') || url.includes('/credencializacion') || url.includes('/carga-masiva')) {
      return 'consultas';
    }

    if (url.includes('/plantilla-anam')) {
      return 'anam';
    }

    if (url.includes('/provisional')) {
      return 'nuevo-laredo';
    }

    if (url.includes('/credencializacion') || url.includes('/enrolamiento') || url.includes('/carga-masiva')) {
      return this._selectedBlock() === 'consultas' ? 'anam' : (this._selectedBlock() || 'anam');
    }

    return this._selectedBlock();
  }
}
