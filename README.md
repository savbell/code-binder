# 💻📂 Code Binder

Code Binder is a Visual Studio Code extension that allows you to combine multiple code files and folders into a single text file. It is still in early development.


## Requirements

- Visual Studio Code: [Download and install Visual Studio Code](https://code.visualstudio.com/download)


## Extension Settings

This extension contributes the following settings:

* `code-binder.includeExtensions`: Only include files with these comma-separated file extensions. (default: '')
* `code-binder.excludeExtensions`: Exclude files with these comma-separated file extensions. (default: '')
* `code-binder.outputFileName`: The name of the output file. (default: 'binded-code.txt')
* `code-binder.prependText`: Text to prepend to the output file. (default: '')
* `code-binder.appendText`: Text to append to the output file. (default: '')
* `code-binder.printFullPath`: If true, print the full path of the files in the output file. (default: false)
* `code-binder.printFolderStructure`: If true, print the folder structure in its own section in the output file. (default: false)

For example:
```json
{
  "code-binder.includeExtensions": ".js,.ts",
  "code-binder.excludeExtensions": ".min.js,.test.js",
  "code-binder.prependText": "/* Start of code */",
  "code-binder.appendText": "/* End of code */",
  "code-binder.outputFileName": "combined-js-code.txt",
  "code-binder.printFullPath": false,
  "code-binder.printFolderStructure": true
}

```

## Known Issues

Tons! This is a work in progress.


## License

This project is licensed under the GNU General Public License. See the [LICENSE](LICENSE) file for details.