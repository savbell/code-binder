import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';


let persistedSelection: string[] = [];


async function showDialog(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'codeBinderDialog',
        'Code Binder',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [],
            retainContextWhenHidden: true,
        },
    );

    const persistedSelectionHtml = persistedSelection.join('<br>');

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Binder</title>
        </head>
        <body>
            <h1>Code Binder</h1>
            <p>Select files and folders to bind:</p>
            <button id="selectFiles">Select Files</button>
            <button id="selectFolders">Select Folders</button>
            <div id="selection">${persistedSelectionHtml}</div>
            <button id="bindCode">Bind Code</button>
            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById('selectFiles').addEventListener('click', () => {
                    vscode.postMessage({ command: 'selectFiles' });
                });

                document.getElementById('selectFolders').addEventListener('click', () => {
                    vscode.postMessage({ command: 'selectFolders' });
                });

                document.getElementById('bindCode').addEventListener('click', () => {
                    vscode.postMessage({ command: 'bindCode' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateSelection') {
                        document.getElementById('selection').innerHTML = message.selection.join('<br>');
                    }
                });
            </script>
        </body>
        </html>
    `;

    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'selectFiles':
                    const selectedFiles = await pickFiles();
                    if (selectedFiles) {
                        persistedSelection.push(...selectedFiles);
                        context.workspaceState.update('code-binder.selection', persistedSelection);
                        panel.webview.postMessage({ command: 'updateSelection', selection: persistedSelection });
                    }
                    break;
                case 'selectFolders':
                    const selectedFolders = await pickFolders();
                    if (selectedFolders) {
                        persistedSelection.push(...selectedFolders);
                        context.workspaceState.update('code-binder.selection', persistedSelection);
                        panel.webview.postMessage({ command: 'updateSelection', selection: persistedSelection });
                    }
                    break;
                case 'bindCode':
                    await bindCodeWrapper(context, persistedSelection);
                    break;
            }
        },
        undefined,
        context.subscriptions,
    );
};

async function pickFiles(): Promise<string[]> {
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

    const filePaths = selectedFiles && selectedFiles.length > 0 ? selectedFiles.map(file => file.fsPath) : [];

    return [...filePaths];
}

async function pickFolders(): Promise<string[]> {
    const activeTextEditor = vscode.window.activeTextEditor;
    let defaultUri: vscode.Uri | undefined;

    if (activeTextEditor) {
        const activeFilePath = activeTextEditor.document.uri.fsPath;
        defaultUri = vscode.Uri.file(path.dirname(activeFilePath));
    } else if (vscode.workspace.workspaceFolders) {
        defaultUri = vscode.workspace.workspaceFolders[0].uri;
    }

    const selectedFolders = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Select folders to bind',
        defaultUri
    });

    const folderPaths = selectedFolders && selectedFolders.length > 0 ? selectedFolders.map(folder => folder.fsPath) : [];

    return [...folderPaths];
}


export function readFiles(dir: string, includeExtensions?: string[], excludeExtensions?: string[], fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const fileExtension = path.extname(filePath);
        if (fs.statSync(filePath).isDirectory()) {
            fileList = readFiles(filePath, includeExtensions, excludeExtensions, fileList);
        } else {
            if ((includeExtensions?.length === 0 || includeExtensions?.includes(fileExtension)) && (!excludeExtensions || !excludeExtensions.includes(fileExtension))) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
};


function generateFolderStructure(dir: string, files: string[], persistedSelection: string[], prefix = '', isRoot = true): string {
    let output = '';

    if (isRoot) {
        output += `${path.basename(dir)}\n`;
    }

    const filesAndFolders = fs.readdirSync(dir).map(item => path.join(dir, item));
    const filteredFilesAndFolders = filesAndFolders.filter(item => {
        const isFileInSelectedFolders = files.some(file => file.startsWith(item));
        const isFolderInSelectedFolders = persistedSelection.some(folder => item.startsWith(folder));
        return isFileInSelectedFolders || isFolderInSelectedFolders;
    });    

    filteredFilesAndFolders.forEach((itemPath, index) => {
        const item = path.basename(itemPath);
        const isDirectory = fs.statSync(itemPath).isDirectory();
        const isLast = index === filteredFilesAndFolders.length - 1;

        output += `${prefix}${isLast ? '└──' : '├──'} ${item}\n`;

        if (isDirectory) {
            const newPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;
            output += generateFolderStructure(itemPath, files, persistedSelection, newPrefix, false);
        }
    });

    return output;
}

function bindCode(files: string[], output: string, prependText: string, appendText: string, printFullPath: boolean, printFolderStructure: boolean, workspaceFolderPath: string) {
    const outputFileContent: string[] = [];

    if (prependText) {
        outputFileContent.push(prependText);
        outputFileContent.push('\n\n');
    }

    if (printFolderStructure && files.length > 0) {
        outputFileContent.push('==== Folder Structure ====\n');
        outputFileContent.push(generateFolderStructure(workspaceFolderPath, files, persistedSelection, '', true));
        outputFileContent.push('\n');
    }

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


async function bindCodeWrapper(context: vscode.ExtensionContext, persistedSelection: string[]) {
    const config = vscode.workspace.getConfiguration('code-binder');
    const workspaceFolderPath = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : '';
    const includeExtensionsStr = config.get<string>('includeExtensions') || '';
    const excludeExtensionsStr = config.get<string>('excludeExtensions') || '';
    const includeExtensions = includeExtensionsStr ? includeExtensionsStr.split(',').map(ext => ext.trim()) : [];
    const excludeExtensions = excludeExtensionsStr ? excludeExtensionsStr.split(',').map(ext => ext.trim()) : [];
    const prependText = config.get<string>('prependText') || '';
    const appendText = config.get<string>('appendText') || '';
    const outputFileName = config.get<string>('outputFileName') || 'output.txt';
    const outputFullPath = path.join(workspaceFolderPath, outputFileName);
    const printFullPath = config.get<boolean>('printFullPath') || false;
    const printFolderStructure = config.get<boolean>('printFolderStructure') || false;

    persistedSelection = context.workspaceState.get('code-binder.selection', []);

    if (persistedSelection.length === 0) {
        vscode.window.showInformationMessage("No files or folders were selected.");
        return;
    }

    let fileList: string[] = [];

    persistedSelection.forEach(item => {
        if (fs.statSync(item).isDirectory()) {
            const folderFiles = readFiles(item, includeExtensions, excludeExtensions, []);
            fileList = fileList.concat(folderFiles);
        } else {
            fileList.push(item);
        }
    });

    bindCode(fileList, outputFullPath, prependText, appendText, printFullPath, printFolderStructure, workspaceFolderPath);
    await vscode.window.showInformationMessage(`Code files combined into ${outputFileName}`);
    const doc = await vscode.workspace.openTextDocument(outputFullPath);
    vscode.window.showTextDocument(doc);
}



export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('code-binder.bindCode', async () => {
        showDialog(context);
    });

    context.subscriptions.push(disposable);
}


export function deactivate() {}
