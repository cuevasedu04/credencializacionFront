import re

html_path = '/home/dev/credencializacion/CredencializacionFront/src/app/content/familiar/familiar.component.html'
with open(html_path, 'r') as f:
    html = f.read()

# We want to replace everything inside the <div class="campos-overlay"> of FRENTE
# Before the <!-- ======================= REVERSO
frente_start = html.find('<!-- ======================= FRENTE')
reverso_start = html.find('<!-- ======================= REVERSO')

frente_content = html[frente_start:reverso_start]

# extract everything up to <!-- NOMBRE
prefix_idx = frente_content.find('<!-- NOMBRE')
prefix = frente_content[:prefix_idx]

new_frente_fields = """<!-- NOMBRE  -->
<div class="campo-nombre" style="position: absolute; top: 60%; left: 35%; width: 55%;">
<ng-container *ngIf="isPrintMode">
<span class="text-black" style="font-size: 21px; font-family: 'NotoSans-Bold', Arial, sans-serif; display: block; text-align: left;">{{ empleado.nombre }}</span>
</ng-container>
<ng-container *ngIf="!isPrintMode">
<input type="text" [disabled]="!editable" 
   class="campo-credencial text-black text-left" 
   style="font-size: 0.75rem; background: transparent;"
   [(ngModel)]="empleado.nombre" 
   placeholder="Nombre">
</ng-container>
</div>

<!-- APELLIDOS -->
<div class="campo-apellidos" style="position: absolute; top: 64.5%; left: 35%; width: 55%;">
<ng-container *ngIf="isPrintMode">
<span class="text-black" style="font-size: 21px; font-family: 'NotoSans-Bold', Arial, sans-serif; display: block; text-align: left;">{{ empleado.paterno }} {{ empleado.materno }}</span>
</ng-container>
<ng-container *ngIf="!isPrintMode">
<input type="text" [disabled]="!editable" 
   class="campo-credencial text-black text-left" 
   style="font-size: 0.75rem; background: transparent;"
   [ngModel]="(empleado.paterno || '') + ' ' + (empleado.materno || '')"
   (ngModelChange)="separarApellidos($event)"
   placeholder="Apellidos">
</ng-container>
</div>

<!-- NÚMERO DE EMPLEADO -->
<div class="campo-num-empleado" style="position: absolute; top: 69%; left: 45%; width: 45%;">
<ng-container *ngIf="isPrintMode">
<span style="color: #000000; font-size: 21px; font-family: 'NotoSans-Bold', Arial, sans-serif; font-weight: 700; display: block; text-align: left;">{{ empleado.num_empleado }}</span>
</ng-container>
<ng-container *ngIf="!isPrintMode">
<input type="text" [disabled]="!editable" 
   class="campo-credencial text-left" 
   style="color: #000000; font-size: 0.75rem; background: transparent;"
   [(ngModel)]="empleado.num_empleado" 
   placeholder="No. Empleado">
</ng-container>
</div>

<!-- FOTO DEL EMPLEADO -->
<div class="campo-foto" 
 style="position: absolute; top: 31.6%; left: 27.6%; width: 44.8%; height: 26.5%; padding: 1.5px;"
 [style.cursor]="isPrintMode ? 'default' : 'pointer'"
 (click)="abrirCamara()">
                        
<!-- Modo impresión: usa background-image para mejor compatibilidad con html2canvas -->
<div *ngIf="empleado.foto && isPrintMode" 
 [style.background-image]="'url(' + empleado.foto + ')'"
 style="width: 100%; height: 100%; background-size: cover; background-position: center top; border-radius: 2px; background-repeat: no-repeat;">
</div>
                        
<!-- Modo visualización-->
<img *ngIf="empleado.foto && !isPrintMode" 
 [src]="empleado.foto" 
 style="width: 100%; height: 100%; object-fit: cover; object-position: center top; border-radius: 2px; display: block;">
                        
<div *ngIf="!empleado.foto && !isPrintMode" 
 class="text-muted text-center d-flex flex-column align-items-center justify-content-center h-100"
 style="border: 2px dashed rgba(114, 47, 55, 0.4); border-radius: 4px; background: rgba(255,255,255,0.8);">
<i class="fas fa-camera fa-2x mb-1" style="color: rgba(114, 47, 55, 0.5);"></i>
<small style="font-size: 0.65rem; color: rgba(114, 47, 55, 0.6);">Capturar foto</small>
</div>
</div>

</div>
</div>

"""

new_frente_content = prefix + new_frente_fields

new_html = html[:frente_start] + new_frente_content + html[reverso_start:]

with open(html_path, 'w') as f:
    f.write(new_html)

