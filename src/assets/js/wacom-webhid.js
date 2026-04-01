/*
    WACOM STU-WebHID Driver (Modified for STU-430/540)
    Based on: https://github.com/pabloko/Wacom-STU-WebHID by Pablo García
*/
(function() {
var WacomSTU = function () {

    // Check if WebHID is supported
    this.isSupported = false;
    if (navigator && navigator.hid) {
        this.isSupported = true;
    } else {
        console.warn("WacomSTU: WebHID no detectado. Revise HTTPS/Localhost.");
    }

    /**
     * Device configuration, information and capabilities
     */
    this.config = {
        chunkSize: 253,
        vid: 1386, // 0x056A
        // STU-430 pid is 166 (0xA6). STU-540 is 168 (0xA8). 
        // We will detect this or default to 430 for this specific user case.
        pid: 166, 
        imageFormat24BGR: 0x04,
        width: 320, // STU-430 defaults (will be overwritten by Capability)
        height: 200,
        scaleFactor: 1, 
        pressureFactor: 1023,
        refreshRate: 0,
        tabletWidth: 0,
        tabletHeight: 0,
        deviceName: null,
        firmware: null,
        eSerial: null,
        onPenDataCb: null,
        onHidChangeCb: null,
    };

    /**
     * Report ids
     */
    this.command = {
        penData: 0x01,
        information: 0x08,
        capability: 0x09,
        writingMode: 0x0E,
        eSerial: 0x0F,
        clearScreen: 0x20,
        inkMode: 0x21,
        writeImageStart: 0x25,
        writeImageData: 0x26,
        writeImageEnd: 0x27,
        writingArea: 0x2A,
        brightness: 0x2B, // Check support for 430
        backgroundColor: 0x2E,
        penColorAndWidth: 0x2D,
        penDataTiming: 0x34,
    };

    this.device = null;
    this.image = null;

    // Methods

    this.checkAvailable = async function () {
        if (this.checkConnected()) return true;
        let devices = await navigator.hid.getDevices();
        for (let i = 0; i < devices.length; i++) {
            let device = devices[i];
            // Support both 430 (166) and 540 (168)
            if (device.vendorId == this.config.vid && (device.productId == 166 || device.productId == 168))
                return true;
        }
        return false;
    }.bind(this);

    this.connect = async function () {
        if (this.checkConnected()) return true;
        
        // Request device with filter for ANY Wacom device
        let filters = [
            { vendorId: 1386 } 
        ];
        
        // let filters = [
        //    { vendorId: this.config.vid, productId: 166 }, // STU-430
        //    { vendorId: this.config.vid, productId: 168 }  // STU-540
        // ];
        
        let dev = await navigator.hid.requestDevice({ filters: filters });
        if (dev[0] == null) return false;
        
        this.device = dev[0];
        this.config.pid = this.device.productId; // Update config with actual PID
        
        await this.device.open();
        
        this.device.addEventListener("inputreport", async function (event) {
            if (this.config.onPenDataCb == null) return;
            
            if (event.reportId == this.command.penData || event.reportId == this.command.penDataTiming) {
                // INTENTO DEFINITIVO: OFFSET 2 + BIG ENDIAN
                // Hipótesis: X está en bytes 2-3, Y en 4-5.
                // Anteriormente Offset 2 + LE dio 16660 (0x4114). 
                // Si interpretamos esos bytes (14, 41) en Big Endian, tenemos 0x1441 = 5185.
                // 5185 es un valor PERFECTO para una coordenada (dentro de 9600).
                
                let fByte = event.data.getUint8(0);
                
                // Leemos Big Endian (false) en Offset 2
                let x = event.data.getUint16(2, false); 
                let y = event.data.getUint16(4, false);
                let press = event.data.getUint16(6, false);
                
                let packet = {
                    // Si la presion falla en offset 6, confiamos ciegas en el Bit 0 del byte 0.
                    isDown: (fByte & 1) !== 0,
                    x: x,
                    y: y,
                    pressure: press
                };

                this.config.onPenDataCb(packet);
            }
        }.bind(this));

        // Get Caps (el reporte de capability viene en Big Endian)
        let dv = await this.readData(this.command.capability);
        if (dv) {
            this.config.tabletWidth = dv.getUint16(1, false);  // Big Endian → 9600
            this.config.tabletHeight = dv.getUint16(3, false); // Big Endian → 6000
            this.config.width = dv.getUint16(7, false);        // Big Endian → 320
            this.config.height = dv.getUint16(9, false);       // Big Endian → 200
        }

        return true;
    }.bind(this);

    this.getTabletInfo = function () {
        if (!this.checkConnected()) return null;
        return this.config;
    }.bind(this);

    // Método para suscribirse a los datos del lápiz
    this.onPenData = function (cb) {
        this.config.onPenDataCb = cb;
    }.bind(this);

    this.setInking = async function (enabled) {
        if (!this.checkConnected()) return;
        await this.sendData(this.command.inkMode, new Uint8Array([enabled ? 1 : 0]));
    }.bind(this);

    this.clearScreen = async function () {
        if (!this.checkConnected()) return;
        await this.sendData(this.command.clearScreen, new Uint8Array([0]));
    }.bind(this);

    // Helpers
    this.checkConnected = function () {
        return this.device != null && this.device.opened;
    }.bind(this);

    this.sendData = async function (reportId, data) {
        if (!this.checkConnected()) return;
        await this.device.sendFeatureReport(reportId, data);
    }.bind(this);

    this.readData = async function (reportId) {
        if (!this.checkConnected()) return;
        return await this.device.receiveFeatureReport(reportId);
    }.bind(this);


    return this;
};

// Expose globally
window.WacomSTU = WacomSTU;
})();
