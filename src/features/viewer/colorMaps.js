export const labelNameMap_HCC = {
    1: "Liver", 
    2: "Rt.lobe", 
    3: "RAS", 
    4: "RPS",
    5: "Lt.lobe", 
    6: "LLS", 
    7: "LMS", 
    8: "Spigelian",
    9: "PV", 
    10: "HV", 
    11: "Cancer", 
    12: "BD"
};

export const labelMap_LDLT_PV_5section = {
    1: "HV",
    2: "PV",
    3: "RPS",
    4: "RAS",
    5: "LMS",
    6: "LLS",
    7: "Spigelian"
};

const colorMap_PV_5section = {
    0: [0, 0, 0, 0],
    1: [139, 186, 255, 255],
    2: [193, 157, 255, 255],
    3: [138, 117, 231, 255],
    4: [218, 108, 110, 255],
    5: [185, 202, 99, 255],
    6: [255, 147, 77, 255],
    7: [79, 255, 174, 255] 
}

const labelMap_Kidney_CT_AP = {
    0:"background",
    1:"left_cortex", 
    2:"left_column",
    3:"left_medulla",
    4:"left_renal_pelvis_ureter",
    5:"right_cortex" ,
    6:"right_column" ,
    7:"right_medulla",
    8:"right_renal_pelvis_ureter",
    9:"renal_artery",
    10:"renal_vein",   
}

const colorMap_Kidney_CT_AP = {
    0: [0, 0, 0, 0],
    1: [255, 123, 119, 255],
    2: [176, 191, 73, 255],
    3: [255, 255, 0, 255],
    4: [255, 128, 48, 255],
    5: [255, 123, 119, 255],
    6: [176, 191, 73, 255],
    7: [255, 255, 0, 255],
    8: [255, 128, 48, 255],
    9: [231, 22, 0, 255],
    10: [40, 56, 255, 255]   
}

const labelMap_PS_Flap100 = {
    0: "background",
    1: "Breast_flap",
    2: "DIEP_flap"
}

const colorMap_PS_Flap100 = {
    0: [0, 0, 0, 0],
    1: [255, 105, 180, 255],
    2: [255, 140, 0, 255]
}

const labelMap_PDAC_Pancreas = {
    0: "background",
    1: "pancreas",
    2: "bileduct",
    3: "cancer",
    4: "artery",
    5: "vein",
    6: "spleen"
}

const colorMap_PDAC_Pancreas = {
    0: [0, 0, 0, 0],
    1: [249, 180, 111, 255],
    2: [95, 170, 127, 255],
    3: [234, 36, 36, 255],
    4: [231, 22, 0, 255],
    5: [40, 56, 255, 255],
    6: [157, 108, 162, 255]
}

const labelMap_LDLT_Recip70 = {
    0: "background",
    1: "Recipient Cavity",
    2: "Aorta",
    3: "IVC",
    4: "Kidney",
    5: "Spleen"
}

const colorMap_LDLT_Recip70 = {
    0: [0, 0, 0, 0],
    1: [212, 212, 212, 255],
    2: [231, 22, 0, 255],
    3: [139, 186, 255, 255],
    4: [255, 123, 119, 255],
    5: [157, 108, 162, 255]
}

const labelMap_LDLT_MRCP3Dgrase100 = {
    0: "background",
    1: "BD data",
    2: "BD PV+"
}

const colorMap_LDLT_MRCP3Dgrase100 = {
    0: [0,0,0, 0],
    1: [95, 170, 127, 255],
    2: [193, 157, 255, 255]
}

const labelMap_HCC_MRPP_104 = {
    0: "background",
    1: "RAS",
    2: "RPS",
    3: "LLS",
    4: "LMS",
    5: "Spigelian",
    6: "HV",
    7: "PV",
    8: "Cancer",
    9: "BD",
    10: "Cyst"
}

const colorMap_HCC_MRPP_104 = {
    0: [0,0,0, 0],
    1: [218, 108, 110, 255],
    2: [138, 117, 231, 255],
    3: [255, 147, 77, 255],
    4: [185, 202, 99, 255],
    5: [79, 255, 174, 255],
    6: [139, 186, 255, 255],
    7: [193, 157, 255, 255],
    8: [234, 36, 36, 255],
    9: [95, 170, 127, 255],
    10:[255, 215, 0, 255]
}

const labelMap_HCC_MR20min_30 = {
    0: "background",
    1: "RAS",
    2: "RPS",
    3: "LLS",
    4: "LMS",
    5: "Spigelian",
    6: "HV",
    7: "PV",
    8: "Cancer",
    9: "BD",
    10: "Cyst"
}

const colorMap_HCC_MR20min_30 = {
    0: [0,0,0, 0],
    1: [218, 108, 110, 255],
    2: [138, 117, 231, 255],
    3: [255, 147, 77, 255],
    4: [185, 202, 99, 255],
    5: [79, 255, 174, 255],
    6: [139, 186, 255, 255],
    7: [193, 157, 255, 255],
    8: [234, 36, 36, 255],
    9: [95, 170, 127, 255],
    10:[255, 215, 0, 255]
}

const labelMap_HCC_CT_PP30 = {
    0: "background",
    1: "RAS",
    2: "RPS",
    3: "LLS",
    4: "LMS",
    5: "Spigelian",
    6: "HV",
    7: "PV",
    8: "Cancer",
    9: "Cyst"
}

const colorMap_HCC_CT_PP30 = {
    1:  [218, 108, 110, 255],
    2:  [138, 117, 231, 255],
    3:  [255, 147, 77, 255],
    4:  [185, 202, 99, 255],
    5:  [79, 255, 174, 255],
    6:  [139, 186, 255, 255],
    7:  [193, 157, 255, 255],
    8:  [234, 36, 36, 255],
    9: [255, 215, 0, 255]
} 

export const getLabelMapByModel = (modelName) => {
    console.log("getLabelMapByModel called with modelName:", modelName);
    switch (modelName) {
        case 'HCC-CT-PP30':
            return labelMap_HCC_CT_PP30;
        case 'HCC-MR20min':
            return labelMap_HCC_MR20min_30;
        case 'HCC-MRPP':
            return labelMap_HCC_MRPP_104;
        case 'LDLT-MRCP3Dgrase':
            return labelMap_LDLT_MRCP3Dgrase100;
        case 'LDLT-Recip70':
            return labelMap_LDLT_Recip70;
        case 'PDAC-Pancreas':
            return labelMap_PDAC_Pancreas;
        case 'PS-Flap100':
            return labelMap_PS_Flap100;
        case 'Kidney-CT-AP':
            return labelMap_Kidney_CT_AP;
        case 'Liver-PV-5section':
            return labelMap_LDLT_PV_5section;
        default:
            return labelNameMap_HCC;
    }
}

export const getColorMapByModel = (modelName) => {
    console.log("getColorMapByModel called with modelName:", modelName);
    switch (modelName) {
        case 'HCC-CT-PP30':
            return colorMap_HCC_CT_PP30;
        case 'HCC-MR20min':
            return colorMap_HCC_MR20min_30;
        case 'HCC-MRPP':
            return colorMap_HCC_MRPP_104;
        case 'LDLT-MRCP3Dgrase':
            return colorMap_LDLT_MRCP3Dgrase100;
        case 'LDLT-Recip70':
            return colorMap_LDLT_Recip70;
        case 'PDAC-Pancreas':
            return colorMap_PDAC_Pancreas;
        case 'PS-Flap100':
            return colorMap_PS_Flap100;
        case 'Kidney-CT-AP':
            return colorMap_Kidney_CT_AP;
        case 'Liver-PV-5section':
            return colorMap_PV_5section;
        default:
            return colorNameMap_HCC;
    }
}