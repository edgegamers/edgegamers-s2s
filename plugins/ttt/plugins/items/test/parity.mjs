import ts from 'typescript';
import {createHash} from 'node:crypto';
/** Erase only reviewed extraction adapters; all remaining executable statements are pinned. */
export function normalized(source){
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,removeComments:true}}).outputText;
 const sf=ts.createSourceFile('source.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const transform=context=>{
  const f=context.factory;
  function visit(node){
   if(ts.isFunctionDeclaration(node)&&['resetEffects','resetWeaponFx'].includes(node.name?.text)&&node.body?.statements.length===1){
    const call=node.body.statements[0].expression;
    if(call&&ts.isCallExpression(call)&&call.expression.getText(sf)==='resetOperation'&&ts.isArrowFunction(call.arguments[0])&&ts.isBlock(call.arguments[0].body))return f.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,ts.visitNode(call.arguments[0].body,visit));
   }
   if(ts.isCallExpression(node)){
    const text=node.expression.getText(sf);
    if(['checked','createOwned'].includes(text)&&ts.isArrowFunction(node.arguments[0])&&!ts.isBlock(node.arguments[0].body))return ts.visitNode(node.arguments[0].body,visit);
    if(['entityInput','removeBeam','createBeam'].includes(text))return f.createCallExpression(f.createIdentifier(text),undefined,node.arguments.map(a=>ts.visitNode(a,visit)));
    if(ts.isPropertyAccessExpression(node.expression)&&['acceptInput','remove'].includes(node.expression.name.text))return f.createCallExpression(f.createIdentifier(node.expression.name.text==='acceptInput'?'entityInput':'removeBeam'),undefined,[ts.visitNode(node.expression.expression,visit),...node.arguments.map(a=>ts.visitNode(a,visit))]);
    if(text==='Beam.draw')return f.createCallExpression(f.createIdentifier('createBeam'),undefined,node.arguments.map(a=>ts.visitNode(a,visit)));
    if(text==='resolveSlot'&&node.arguments[0]?.getText(sf)==='hit.entity.index')return f.createCallExpression(f.createIdentifier('resolveSlot'),undefined,[f.createPropertyAccessExpression(f.createIdentifier('hit'),'entity')]);
   }
   if(ts.isExpressionStatement(node)&&node.expression.getText(sf).replaceAll(' ','')==='setPawnColor(body.owner,color)')return undefined;
   if(ts.isIfStatement(node)&&node.expression.getText(sf)==='!isOpen()'&&ts.isReturnStatement(node.thenStatement))return undefined;
   return ts.visitEachChild(node,visit,context);
  }
  return root=>ts.visitNode(root,visit);
 };
 const result=ts.transform(sf,[transform]);
 const printer=ts.createPrinter({removeComments:true}),out={};let extra=0;
 for(const node of result.transformed[0].statements){
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))continue;
  const name=ts.isFunctionDeclaration(node)?node.name?.text:ts.isVariableStatement(node)?node.declarationList.declarations.map(d=>d.name.getText(sf)).join(','):'statement'+extra++;
  if(name?.startsWith('retire'))continue;
  if(!name)throw Error('Unaccounted top-level statement: '+node.getText(sf));
  out[name]=printer.printNode(ts.EmitHint.Unspecified,node,result.transformed[0]);
 }
 result.dispose();return out;
}
export const hashes=source=>Object.fromEntries(Object.entries(normalized(source)).map(([name,value])=>[name,createHash('sha256').update(value).digest('hex')]));
