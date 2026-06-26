import{t as e}from"./rolldown-runtime.oBlc_ARb.mjs";import{D as t,R as n,l as r,s as i}from"./react.CCayjioS.mjs";import{P as a,c as o,et as s}from"./framer.D7W5cTfe.mjs";function c(e){let{scopes:t=[],includeInputs:i=!0}=e;return n(()=>{if(typeof document>`u`)return;let e=`geo-text-highlight-global`,n=document.getElementById(e);n||(n=document.createElement(`style`),n.id=e,document.head.appendChild(n));let r=(e,t)=>{switch(e){case`global`:return``;case`headings`:return`h1::selection, h2::selection, h3::selection, h4::selection, h5::selection, h6::selection`;case`links`:return`a`;case`code`:return`code, pre`;case`inputs`:return`input, textarea`;case`custom`:return!t||t.trim()===``?`*`:t.split(`,`).map(e=>e.trim()).filter(e=>e.length>0).map(e=>`${e}::selection`).join(`, `);default:return``}},a=``;return[...t].sort((e,t)=>e.scope===`global`?-1:t.scope===`global`?1:0).forEach(e=>{let t=r(e.scope,e.customSelector),n=e.scope===`headings`||e.scope===`custom`?t:t?`${t}::selection`:`::selection`,i=e.scope===`headings`||e.scope===`custom`?t.replace(/::selection/g,`::-moz-selection`):t?`${t}::-moz-selection`:`::-moz-selection`;e.themeMode?a+=`
            ${n} {
                background-color: ${e.lightBg};
                color: ${e.lightText};
            }
            ${i} {
                background-color: ${e.lightBg};
                color: ${e.lightText};
            }
            
            @media (prefers-color-scheme: light) {
                ${n} {
                    background-color: ${e.lightBg};
                    color: ${e.lightText};
                }
                ${i} {
                    background-color: ${e.lightBg};
                    color: ${e.lightText};
                }
            }
            
            @media (prefers-color-scheme: dark) {
                ${n} {
                    background-color: ${e.darkBg};
                    color: ${e.darkText};
                }
                ${i} {
                    background-color: ${e.darkBg};
                    color: ${e.darkText};
                }
            }
            `:a+=`
            ${n} {
                background-color: ${e.bg};
                color: ${e.text};
            }
            ${i} {
                background-color: ${e.bg};
                color: ${e.text};
            }
            `}),!i&&!t.some(e=>e.scope===`inputs`)&&(a+=`
            input::selection,
            textarea::selection {
                background-color: Highlight;
                color: HighlightText;
            }
            input::-moz-selection,
            textarea::-moz-selection {
                background-color: Highlight;
                color: HighlightText;
            }
            `),a+=`
            @media (forced-colors: active) {
                ::selection {
                    background-color: Highlight;
                    color: HighlightText;
                }
                ::-moz-selection {
                    background-color: Highlight;
                    color: HighlightText;
                }
            }
        `,n.textContent=a,()=>{n&&n.parentNode&&n.parentNode.removeChild(n)}},[t,i]),r(`div`,{style:{width:5,height:5,pointerEvents:`none`}})}var l=e((()=>{i(),s(),t(),a(c,{scopes:{type:o.Array,title:`Color Scopes`,control:{type:o.Object,controls:{scope:{type:o.Enum,title:`Scope`,options:[`global`,`headings`,`links`,`code`,`inputs`,`custom`],optionTitles:[`Global`,`Headings`,`Links`,`Code`,`Inputs`,`Custom`],defaultValue:`global`},customSelector:{type:o.String,title:`Custom Selector`,defaultValue:``,placeholder:`.my-class, #my-id`,hidden:e=>e.scope!==`custom`},themeMode:{type:o.Boolean,title:`Theme Mode`,defaultValue:!1,enabledTitle:`Light/Dark`,disabledTitle:`Single`},bg:{type:o.Color,title:`Background`,defaultValue:`#0099FF`,hidden:e=>e.themeMode},text:{type:o.Color,title:`Text`,defaultValue:`#FFFFFF`,hidden:e=>e.themeMode},lightBg:{type:o.Color,title:`Light BG`,defaultValue:`#0099FF`,hidden:e=>!e.themeMode},lightText:{type:o.Color,title:`Light Text`,defaultValue:`#FFFFFF`,hidden:e=>!e.themeMode},darkBg:{type:o.Color,title:`Dark BG`,defaultValue:`#8855FF`,hidden:e=>!e.themeMode},darkText:{type:o.Color,title:`Dark Text`,defaultValue:`#FFFFFF`,hidden:e=>!e.themeMode}}},defaultValue:[{scope:`global`,customSelector:``,themeMode:!1,bg:`#0099FF`,text:`#FFFFFF`,lightBg:`#0099FF`,lightText:`#FFFFFF`,darkBg:`#8855FF`,darkText:`#FFFFFF`}],maxCount:10},includeInputs:{type:o.Boolean,title:`Include Inputs`,defaultValue:!0,enabledTitle:`Yes`,disabledTitle:`No`}})}));export{l as n,c as t};
//# sourceMappingURL=TextHighlight.DEmGK8AK.mjs.map