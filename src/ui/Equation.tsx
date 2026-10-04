import katex from 'katex';
import type { Components } from '../experiment/types';
export function Equation({components,tex}:{components:Components;tex?:Components}){
 const escaped=components.map(s=>s.replace(/[\\{}$%&#_]/g,'').replace(/\*/g,'\\,').replace(/\bpi\b/g,'\\pi'));
 const html=katex.renderToString(`\\mathbf{F}(x,y,z)=\\left(${(tex||escaped).join(',\\;')}\\right)`,{throwOnError:false,output:'htmlAndMathml',strict:false});
 return <div className="equation" role="math" aria-label={`Campo F: ${components.join(', ')}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
