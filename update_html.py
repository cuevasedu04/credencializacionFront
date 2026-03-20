import codecs

file_path = 'src/app/content/busqueda-avanzada/busqueda-avanzada.component.html'
text = codecs.open(file_path, 'r', 'utf-8').read()

old_header = '<div class="card-header bg-white py-3 d-flex justify-content-between align-items-center border-bottom">'
new_header = '''<div class="card-header bg-white pt-3 pb-0 d-flex justify-content-between align-items-end border-bottom">
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
            <div class="d-none">'''

# Let's replace only the wrapping part and leave the old code inside the hidden div. Or replace everything manually
text = text.replace(old_header, new_header)

old_text = '''<h5 class="mb-0 text-dark fw-bold">
                <i class="fas fa-table me-2 text-primary"></i>Resultados
            </h5>
                <div class="d-flex gap-2">'''

new_text = '</div><div class="d-flex gap-2 mb-2">'
text = text.replace(old_text, new_text)

codecs.open(file_path, 'w', 'utf-8').write(text)
