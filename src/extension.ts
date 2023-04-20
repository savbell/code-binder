import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';


let persistedSelection: string[] = [];


async function pickFilesAndFolders(): Promise<string[]> {
    const activeTextEditor = vscode.window.activeTextEditor;
    let defaultUri: vscode.Uri | undefined;

    if (activeTextEditor) {
        const activeFilePath = activeTextEditor.document.uri.fsPath;
        defaultUri = vscode.Uri.file(path.dirname(activeFilePath));
    } else if (vscode.workspace.workspaceFolders) {
        defaultUri = vscode.workspace.workspaceFolders[0].uri;
    }

    const selectedFiles = await vscode.window.showOpenDialog({
        canSelectMany: true,
        openLabel: 'Select files to bind',
        defaultUri
    });

    const selectedFolders = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Select folders to bind',
        defaultUri
    });

    const filePaths = selectedFiles && selectedFiles.length > 0 ? selectedFiles.map(file => file.fsPath) : [];
    const folderPaths = selectedFolders && selectedFolders.length > 0 ? selectedFolders.map(folder => folder.fsPath) : [];

    return [...filePaths, ...folderPaths];
}


function readFiles(dir: string, includeExtension?: string, excludeExtension?: string, fileList: string[] = []): string[] {
    console.log(`Reading files in folder: ${dir}`);
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            fileList = readFiles(filePath, includeExtension, excludeExtension, fileList);
        } else {
            if ((!includeExtension || filePath.endsWith(includeExtension)) && (!excludeExtension || !filePath.endsWith(excludeExtension))) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}


function bindCode(files: string[], output: string, prependText: string, appendText: string, printFullPath: boolean, printFolderStructure: boolean, workspaceFolderPath: string) {
    const outputFileContent: string[] = [];

    if (prependText) {
        outputFileContent.push(prependText);
        outputFileContent.push('\n');
    }

    if (printFolderStructure) {
    }
        outputFileContent.push('==== Folder Structure ====\n\n');
        outputFileContent.push(generateFolderStructure(workspaceFolderPath, files));
        outputFileContent.push('\n');

    files.forEach(file => {
        if (printFullPath) {
            outputFileContent.push(`==== ${file} ====\n`);
        } else {
            const fileName = path.basename(file);
            outputFileContent.push(`==== ${fileName} ====\n`);
        }
        const fileContent = fs.readFileSync(file, 'utf8');
        outputFileContent.push(fileContent);
        outputFileContent.push('\n\n');
    });

    if (appendText) {
        outputFileContent.push(appendText);
    }

    fs.writeFileSync(output, outputFileContent.join(''));
}


function generateFolderStructure(dir: string, files: string[], prefix = ''): string {
    let output = '';
    const filesAndFolders = fs.readdirSync(dir);

    filesAndFolders.forEach((item, index) => {
        const itemPath = path.join(dir, item);
        const isDirectory = fs.statSync(itemPath).isDirectory();
        const isLast = index === filesAndFolders.length - 1;
        
        if (files.includes(itemPath) || files.some(file => file.startsWith(itemPath))) {
            output += `${prefix}${isLast ? '└──' : '├──'} ${item}\n`;

            if (isDirectory) {
                const newPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;
                output += generateFolderStructure(itemPath, files, newPrefix);
            }
        }
    });

    return output;
}


export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('code-binder.bindCode', async () => {
        const config = vscode.workspace.getConfiguration('code-binder');
        const workspaceFolderPath = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : '';
        const includeExtension = config.get<string>('includeExtension') || '';
        const excludeExtension = config.get<string>('excludeExtension') || '';
        const prependText = config.get<string>('prependText') || '';
        const appendText = config.get<string>('appendText') || '';
        const outputFileName = config.get<string>('outputFileName') || 'output.txt';
        const outputFullPath = path.join(workspaceFolderPath, outputFileName);
        const printFullPath = config.get<boolean>('printFullPath') || false;
        const printFolderStructure = config.get<boolean>('printFolderStructure') || false;

        persistedSelection = context.workspaceState.get('code-binder.selection', []);
        
        const newSelection = await pickFilesAndFolders();
        if (newSelection.length > 0) {
            persistedSelection = newSelection;
            await context.workspaceState.update('code-binder.selection', persistedSelection);
        }

        let fileList: string[] = [];

        persistedSelection.forEach(item => {
            if (fs.statSync(item).isDirectory()) {
                const folderFiles = readFiles(item, includeExtension, excludeExtension);
                fileList = fileList.concat(folderFiles);
            } else {
                fileList.push(item);
            }
        });

        bindCode(fileList, outputFullPath, prependText, appendText, printFullPath, printFolderStructure, workspaceFolderPath);
        vscode.window.showInformationMessage(`Code files combined into ${outputFileName}`).then(() => {
                vscode.workspace.openTextDocument(outputFullPath).then(doc => {
                    vscode.window.showTextDocument(doc);
            });
        });
    });

    context.subscriptions.push(disposable);
}


export function deactivate() {}
