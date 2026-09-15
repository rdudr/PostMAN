/* ===================================================================
   SECTION REGISTRY - the report's content index.

   Derived by comparing the three sample reports (Autotech Nonwovens,
   Bills Biotech, Shree Mahadev Silk Mills). A fixed spine appeared in all
   three; the utility middle varied entirely. So the spine is hard-coded
   and the middle is a registry: adding a plant type you have never audited
   means adding an entry here, not editing the engine.
   =================================================================== */

var SECTIONS = [
  { id:'cover',       group:'Front matter', title:'Cover & report',        always:true },
  { id:'team',        group:'Front matter', title:'Assessment team',       always:true },
  { id:'frontText',   group:'Front matter', title:'Preface & disclaimer',  always:true },
  { id:'certificate', group:'Front matter', title:'Certificate',           always:true, derived:true },

  { id:'summary',     group:'Assessment',   title:'Executive summary',     always:true, derived:true },
  /* Recommendations are added on the chapter they belong to - the bill
     and each utility - so there is no separate ledger screen in the menu. */
  { id:'production',  group:'Assessment',   title:'Production process',    always:true },
  { id:'baseline',    group:'Assessment',   title:'Energy baseline',       always:true },
  { id:'water',       group:'Assessment',   title:'Water baseline',        opt:'water' },
  { id:'ghg',         group:'Assessment',   title:'GHG accounting',        always:true, derived:true },
  { id:'verify',      group:'Assessment',   title:'Bill capture & verify', always:true },
  { id:'bills',       group:'Assessment',   title:'Electricity bill analysis', always:true },
  { id:'dist',        group:'Assessment',   title:'Electrical distribution', always:true },
  { id:'tr',          group:'Assessment',   title:'Power quality & transformer', always:true },
  { id:'sld',         group:'Assessment',   title:'Single line diagram',   always:true },

  { id:'boiler',       group:'Utilities', title:'Boiler',                opt:'boiler' },
  { id:'tfh',          group:'Utilities', title:'Thermic fluid heater',  opt:'tfh' },
  { id:'compressor',   group:'Utilities', title:'Air compressor',        opt:'compressor' },
  { id:'coolingTower', group:'Utilities', title:'Cooling tower',         opt:'coolingTower' },
  { id:'chiller',      group:'Utilities', title:'Chiller',               opt:'chiller' },
  { id:'pumps',        group:'Utilities', title:'Pumping system',        opt:'pumps' },
  { id:'jets',         group:'Utilities', title:'Jet machines (textile)', opt:'jets' },
  { id:'lux',          group:'Utilities', title:'Lux / lighting',        opt:'lux' },
  { id:'solar',        group:'Utilities', title:'Solar plant',           opt:'solar' },
  { id:'earth',        group:'Utilities', title:'Earth loop resistance', opt:'earth' },
  { id:'machines',     group:'Utilities', title:'Machine monitoring',    opt:'machines' },
  { id:'sop',          group:'Utilities', title:'Guidelines / SOP',      opt:'sop' },

  { id:'custom',      group:'Closing', title:'Your own pages',   always:true },
  { id:'instruments', group:'Closing', title:'Instruments used', always:true },
  { id:'imports',     group:'Closing', title:'Import field data', always:true, tool:true },
  { id:'costs',       group:'Closing', title:'Cost register',     always:true, tool:true }
];

function sectionById(id){
  for (var i=0;i<SECTIONS.length;i++) if (SECTIONS[i].id === id) return SECTIONS[i];
  return null;
}
function sectionOn(sec){ return sec.always || S.enabled[sec.opt]; }

/* ===================================================================
   DEFAULTS LIBRARY - verbatim across all three sample reports, so these
   are defaults rather than fields. Every block is versioned by an
   effective date so a report stays reproducible after the wording moves on.
   =================================================================== */
var DEFAULTS = {
  version: '2026-07',

  preface: [
    'About Industrial Energy Assessment at IIT Gandhinagar',
    'Industrial Energy Assessment Cell (IEAC) was established in the year 2022 in IC&SR, IIT Madras with the motto of "research and technological service to the nation towards sustainable energy and resource management". As a part of this, we conduct walk-through and detailed energy assessments in typical process industries to explore, evaluate and recommend hidden potentials for reducing their specific energy consumption and carbon emission in all possible ways.',
    'IEAC have a team of professors from various domains to guide and evaluate our work. Our assessment team comprises of a Bureau of Energy Efficiency (BEE) - certified energy auditor and a couple of thermal experts to carry out energy assessments. The work described in this report was performed by the KISEM-IITGN Team in conjunction with IEAC, IIT Madras. This assessment is being carried out as a part of an industry outreach activity by IIT Gandhinagar Energy assessment team.',
    'The objective of KISEM is to identify, evaluate, and recommend - through analyses of industrial plant operations - opportunities to conserve energy, minimize waste, and reduce the overall cost of operations. Our recommendations are based upon observations and measurements made at your plant. As our time was limited, we do not claim to have complete detail on every aspect of the plant’s operations. At all times, we try to offer specific and quantitative recommendations of cost savings, energy conservation, and waste minimization of the plants. However, we do not attempt to prepare engineering designs or otherwise perform services that you would expect from an engineering firm, a vendor, or a manufacturer’s representative. When the need for that kind of assistance arrives, we urge you to consult them directly.',
    'For energy assessment case studies and the Energy Audit Tool, visit https://kisem.org'
  ],

  disclaimerIntro: 'The contents of this report are offered as guidance. All technical sources referenced in this report do not:',
  disclaimerBullets: [
    'Make any warranty or representation, expressed or implied, with respect to the accuracy, completeness, or usefulness of the information contained in this report, or that the use of any information, apparatus, method, or process disclosed in this report may not infringe on privately owned rights.',
    'The data and findings in the assessment activity are not publicly available and cannot be published on any platform.',
    'Assume any liabilities with respect to the use of, or for damages resulting from the use of, any information, apparatus, methods, or processes disclosed in this report. This report does not reflect the official views or policies of the above-mentioned institutions. Mention of trade names or commercial products does not constitute endorsement or recommendation of use.'
  ],
  disclaimerReco: 'All the assessment recommendations are described in detail in the respective sections in this report. Further, the suggested actions are also indicated. The annual cost savings and implementation costs represent our best estimates. You may want to consult other sources to verify these estimates before making a final decision for implementing these recommendations. We welcome inquiries and further discussion on any information or data contained in this report.',

  /* {{company}} and {{poc}} and {{dept}} resolve from the intake fields. */
  acknowledgement: [
    'Industrial Energy Assessment Team (IEA), Indian Institute of Technology (IIT) - Gandhinagar expresses its sincere thanks for the initiative, support, involvement and cooperation provided by all members of M/s {{company}} who participated with us in the Energy Assessment activities, in sharing the details as required and providing all the valuable inputs required for carrying out energy assessment inclusive of pre-assessment and post assessment activities, data analysis and the report generation.',
    'The study team is indebted to {{poc}} of the plant for showing keen interest in the study and thankful to the M/s {{company}} management for their wholehearted support and cooperation in the preparation of the energy audit report, without which the study would not have steered to its successful completion. Special thanks to {{dept}} for their excellent coordination and seamless support for field measurement activities.',
    'We also acknowledge all the transparency and courtesies extended during the stay and assessment activities.',
    'It is well worth mentioning that the efforts being taken, and the enthusiasm shown by all the plant personnel towards energy conservation and sustainable growth were admirable. We found all the personnel keen to implement the possible energy conservation aspects.'
  ],

  certificate: 'This is to certify that M/s {{company}} has participated in Industrial Energy assessment and Sustainability studies by IIT Gandhinagar. We appreciate the plant’s efforts and support for facilitation of energy assessment and sustainability studies at plant premises. The data collection has been carried out diligently and truthfully; all data monitoring devices are in good working condition and have been calibrated or certified by approved agencies authorized and no tampering of such devices has occurred; all reasonable professional skill, care and diligence had been taken in preparing the energy audit report and the contents thereof are a true representation of the facts; adequate training provided to personnel involved in daily operations after implementation of recommendations; and the energy audit has been carried out in accordance with the Bureau of Energy Efficiency (Manner and Intervals of Time for the Conduct of Energy Audit) Regulations, 2010.',

  boilerMethod: [
    'Boiler efficiency is the percentage of heat input that is effectively utilised to generate steam. There are two methods of assessing it.',
    'Direct method (input-output method): the energy gain of the working fluid is compared with the energy content of the fuel. It needs only the useful output (steam) and the heat input (fuel).',
    'Indirect method (heat loss method): efficiency is 100 minus the sum of the losses - dry flue gas, moisture in fuel and combustion air, combustion of hydrogen, radiation, and unburnt.'
  ],
  pumpMethod: [
    'Pumps and blowers operate at optimum efficiency only at their rated head and output; at other operating conditions efficiency falls. Where variable flow is required, variable speed drives reduce power consumption roughly in proportion to the flow requirement, following the affinity laws.',
    'Three parameters are needed to determine pump efficiency: flow, head and power. Flow is the hardest - where no permanent flow meter exists, a portable ultrasonic meter measures it non-invasively.'
  ],
  /* Measurement list for the jet section - the same eight tests JET-Eff
     collects a screen for, in the order the sample report prints them. */
  jetMethod: [
    'Jet machine water-side flow measurement',
    'Jet pressure measurement',
    'Circulation pump efficiency',
    'Pump power consumption',
    'Surface heat loss from the jet body',
    'Heat exchanger performance of the jet',
    'Steam and water temperature across the jet heat exchanger',
    'Steam trap performance assessment'
  ],
  luxMethod: [
    'The lighting assessment uses a calibrated digital lux meter, following the methodology recommended by the Bureau of Energy Efficiency.',
    'Area dimensions give the floor area and Room Index. Illuminance is measured at the centre of each grid on the working plane. Installed Load Efficacy (ILE) is measured lux per watt per square metre; the Installed Load Efficacy Ratio (ILER) is measured ILE against the target for that space type.'
  ],
  ilerBands: [
    ['>= 0.75','Satisfactory to good'],
    ['0.51 - 0.74','Review suggested'],
    ['0.375 - 0.50','Urgent action required'],
    ['< 0.375','Immediate action required']
  ],
  ieee519: [
    ['Voltage THD (%VTHD)','< 5.00 %'],
    ['Current THD (%ITHD)','< 8.00 % (at Isc/IL < 20)']
  ]
};

function fillTemplate(str){
  return String(str)
    .replace(/\{\{company\}\}/g, S.company.name || '__________')
    .replace(/\{\{poc\}\}/g, S.company.poc || 'the plant team')
    .replace(/\{\{dept\}\}/g, S.company.dept || 'the plant engineering team')
    .replace(/\{\{fy\}\}/g, S.meta.financialYear);
}
