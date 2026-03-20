const fs = require('fs');
let txt = fs.readFileSync('src/app/content/busqueda-avanzada/busqueda-avanzada.component.html', 'utf8');

const regex = /<div class="card-header bg-white py-3[\s\S]*?<div class="d-flex gap-2">/;

const replaceStr =         <div class="card-header bg-white pt-3 pb-0 d-flex justify-content-between align-items-end border-bottom">
            <!-- Pestañas (Tabs) -->
            <ul class="nav nav-tabs border-bottom-0">
                <li class="nav-item">
                    <a class="nav-link" 
                       style="cursor: pointer;"
                       [class.active]="activeTab === 'busqueda'" 
                       [class.fw-bold]="activeTab === 'busqueda'"
                       (click)="selectTab('busqueda')">
                        <i class="fas fa-search me-2" [class.text-primary]="activeTab === 'busqueda'"></i>Búsqueda Avanzada
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" 
                       style="cursor: pointer;"
                       [class.active]="activeTab === 'impresion'" 
                       [class.fw-bold]="activeTab === 'impresion'"
                       (click)="selectTab('impresion')">
                        <i class="fas fa-print me-2" [class.text-primary]="activeTab === 'impresion'"></i>Impresión
                    </a>
                </li>
            </ul>
                <div class="d-flex gap-2 mb-2">;

txt = txt.replace(regex, replaceStr);
fs.writeFileSync('src/app/content/busqueda-avanzada/busqueda-avanzada.component.html', txt);
