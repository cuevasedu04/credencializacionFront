import { Component } from '@angular/core';
import { ProvisionalComponent } from '../provisional/provisional.component';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { UtilsService } from '../../services/utils.service';
import { Router } from '@angular/router';
import { WacomService } from '../../services/wacom.service';

@Component({
  selector: 'app-familiar',
  standalone: false,
  templateUrl: './familiar.component.html',
  styleUrls: ['./familiar.component.scss']
})
export class FamiliarComponent extends ProvisionalComponent {
  constructor(
    modalManager: ModalManagerService,
    enrolamientoApi: EnrolamientoService,
    utils: UtilsService,
    router: Router,
    wacomService: WacomService
  ) {
    super(modalManager, enrolamientoApi, utils, router, wacomService);
    this.tipoCredencialLabel = 'familiar';
    this.qrPrefix = 'FAMILIAR';
  }

}
