if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    alert("The File APIs are not fully supported in this browser.");
}

const parseFile = function (file) {
    const converter = new StreamConverter();

    Papa.parse(file, {
        header: true,
        step: function (results, parser) {
            converter.convert(results, parser);
        },
        errors: function (error, file) {
            converter.errorHandle(error, file);
        },
        complete: function (results, file) {
            toastr.success(file.name + " was succesfully parsed");
            converter.complete(results);
        }
    });
};

Dropzone.options.dropzone = {
    paramName: "file",
    clickable: true,
    uploadMultiple: true,
    ignoreHiddenFiles: true,
    accept: function (file, done) {
        if (file.name.endsWith(".csv")) {
            // TODO: check if file is succesfully parsed
            parseFile(file);
            this.removeFile(file);
            done();
        } else {
            toastr.error(file.name + " was not parsed");
            this.removeFile(file);
            done("Could not parse file " + file.name);
        }
    },
    acceptedMimeTypes: ["text/csv", "application/octet-stream", "text/plain", "application/vnd.ms-excel", "text/x-csv"],
    dictDefaultMessage: "Drag csv's here or click here to select the files from your device",
    complete: function (file) {
        this.removeFile(file);
    },
    addRemoveLinks: false
};

const parse = () => {
    const files = document.getElementById("file").files;

    for (let index = 0, file; file = files[index]; ++index) {
        parseFile(file);
    }
};

const AccountData = function (accountNumber) {
    let csvData = [
        ["Date", "Payee", "Category", "Memo", "Outflow", "Inflow"]
    ];

    this.addLine = function (data) {
        csvData.push(data);
    };

    this.downloadCSV = function () {
        let blobText = "";

        for (let index = 0, line; line = csvData[index]; ++index) {
            blobText += line.join(';') + '\n';
        }

        const fileName = accountNumber + ".csv";
        const blob = new Blob([blobText], {
            type: "text/csv;charset=utf-8;"
        });

        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            const link = document.createElement("a");

            if (link.download != undefined) {
                let url = URL.createObjectURL(blob);

                link.setAttribute("href", url);
                link.setAttribute("download", fileName);
                link.style.visibility = "hidden";

                document.body.appendChild(link);

                link.click();
            }
        }
    };
};

const Field = function (fieldList, splitsKeep) {
    const getFields = function (line) {
        let returnLine = "";

        for (let index = 0, field; field = fieldList[index]; ++index) {
            if (returnLine !== "") {
                returnLine += " ";
            }
            returnLine += getValues(field, line[field]);
        }

        return returnLine;
    };

    const getValues = function (field, text) {
        let splits = BankMapping.mappings[this.key].splits[field];
        if (Array.isArray(splits) && Array.isArray(splitsKeep)) {
            for (let index in splits) {
                text = text.replace(splits[index] + ":", "|" + splits[index] + ":");
            }
            let explodedText = text.split("|");

            let items = {};
            for (let index in explodedText) {
                let match = explodedText[index].match(/^[a-zA-Z ]*:/);
                if (match === null) {
                    continue;
                }
                match = match[0];
                items[match.substring(0, match.length - 1)] = explodedText[index].trim();
            }

            textKeep = '';
            for (let index in splitsKeep) {
                if (items[splitsKeep[index]] === undefined) {
                    continue;
                }
                if (textKeep !== "") {
                    textKeep += ' | ';
                }
                textKeep += items[splitsKeep[index]];
            }
            return textKeep;
        }
        else {
            return text;
        }
    };

    this.getLine = function (line) {
        return getFields(line);
    };
};

const BankMapping = function (bank) {
    this.getBank = () => {
        return bank;
    }

    this.getAccount = function (line) {
        return BankMapping.mappings[bank].account.getLine(line);
    }

    this.getDate = function (line) {
        const dateField = BankMapping.mappings[bank].date;
        let text = dateField.getLine(line);
        let dateFormat = BankMapping.mappings[bank].dateFormat;

        if (dateFormat == BankMapping.DEFAULT_DATE_FORMAT) {
            return text;
        }

        if (!Array.isArray(dateFormat)) {
            dateFormat = [dateFormat];
        }

        for (let index in dateFormat) {
            let dateRegExp = dateFormat[index];
            dateRegExp = dateRegExp.replace('YYYY', '[1,2][9,0][9,0,1,2][0-9]');
            dateRegExp = dateRegExp.replace('MM', '[0,1][0-9]');
            dateRegExp = dateRegExp.replace('DD', '[0,1,2,3][0-9]');

            let re = new RegExp(dateRegExp);
            let datePosition = text.match(re);
            if (datePosition !== null) {
                text = text.substring(datePosition.index, datePosition.index + dateFormat[index].length);
                dateFormat = dateFormat[index];
                break;
            }
        }

        let year = "";
        let month = "";
        let day = "";
        for (let index = 0; index < dateFormat.length; ++index) {
            switch (dateFormat.charAt(index)) {
                case "Y":
                    year += text.charAt(index);
                    break;
                case "M":
                    month += text.charAt(index);
                    break;
                case "D":
                    day += text.charAt(index);
                    break;
            }
        }

        return year + "-" + month + "-" + day;
    };

    this.getPayee = function (line) {
        return BankMapping.mappings[bank].payee.getLine(line);
    };

    this.getCategory = function (line) {
        return "";
    };

    this.getMemo = function (line) {
        return BankMapping.mappings[bank].memo.getLine(line);
    };

    const isIndicatorPositive = function (indicatorField) {
        if (indicatorField.includes(BankMapping.mappings[bank].positiveIndicator))
            return true;
        return false;
    };

    this.getInflow = function (line) {
        const bankMap = BankMapping.mappings[bank];
        let value = bankMap.inflow.getLine(line);
        let indicator = value;

        if (bankMap.seperateIndicator != null)
            indicator = bankMap.seperateIndicator.getLine(line);

        if (isIndicatorPositive(indicator)) {
            if (bankMap.seperateIndicator != null)
                value = value.replace(bankMap.positiveIndicator, "");
            return value;
        }

        return "0";
    };

    this.getOutflow = function (line) {
        const bankMap = BankMapping.mappings[bank];
        let value = bankMap.outflow.getLine(line);
        let indicator = value;

        if (bankMap.seperateIndicator != null)
            indicator = bankMap.seperateIndicator.getLine(line);

        if (!isIndicatorPositive(indicator)) {
            if (bankMap.seperateIndicator != null)
                value = value.replace(bankMap.negativeIndicator, "");
            if (value.startsWith("-"))
                value = value.replace("-", "");
            return value;
        }

        return "0";
    };
};

BankMapping.RABO = "RABO";
BankMapping.ING = "ING";
BankMapping.DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
BankMapping.mappings = {
    RABO: {
        header: ["IBAN/BBAN", "Munt", "BIC", "Volgnr", "Datum", "Rentedatum", "Bedrag", "Saldo na trn", "Tegenrekening IBAN/BBAN", "Naam tegenpartij", "Naam uiteindelijke partij", "Naam initi�rende partij", "BIC tegenpartij", "Code", "Batch ID", "Transactiereferentie", "Machtigingskenmerk", "Incassant ID", "Betalingskenmerk", "Omschrijving-1", "Omschrijving-2", "Omschrijving-3", "Reden retour", "Oorspr bedrag", "Oorspr munt", "Koers"],
        account: new Field(["IBAN/BBAN"]),
        date: new Field(["Datum"]),
        dateFormat: "YYYY-MM-DD",
        payee: new Field(["Naam tegenpartij"]),
        category: new Field([]),
        memo: new Field(["Omschrijving-1", "Omschrijving-2", "Omschrijving-3"]),
        outflow: new Field(["Bedrag"]),
        inflow: new Field(["Bedrag"]),
        positiveIndicator: "+",
        negativeIndicator: "-",
    },
    ING: {
        header: ["Datum", "Naam / Omschrijving", "Rekening", "Tegenrekening", "Code", "Af Bij", "Bedrag (EUR)", "Mutatiesoort", "Mededelingen"],
        splits: {"Mededelingen": ['Transactie', 'Term', 'Pasvolgnr', 'Omschrijving', 'IBAN', 'Kenmerk', 'Machtiging ID', 'Incassant ID']},
        account: new Field(["Rekening"]),
        date: new Field(["Mededelingen", "Datum"], ["Pasvolgnr"]),
        dateFormat: ["DD-MM-YYYY", "YYYYMMDD"],
        payee: new Field(["Naam / Omschrijving"]),
        category: new Field([]),
        memo: new Field(["Mededelingen"], ['Transactie', 'Term', 'Omschrijving', 'IBAN', 'Kenmerk']),
        outflow: new Field(["Bedrag (EUR)"]),
        inflow: new Field(["Bedrag (EUR)"]),
        positiveIndicator: "Bij",
        negativeIndicator: "Af",
        seperateIndicator: new Field(["Af Bij"])
    }
};
BankMapping.recognizeBank = function (header) {
    const areArraysEqual = (arrayOne, arrayTwo) => {
        for (let index = 0, itemOne, itemTwo; itemOne = arrayOne[index], itemTwo = arrayTwo[index]; ++index) {
            if (itemOne != itemTwo)
                return false;
        }
        return true;
    };

    for (key in BankMapping.mappings) {
        if (areArraysEqual(header, BankMapping.mappings[key].header))
            return new BankMapping(key);
    }
    alert("Could not be parsed");
};

StreamConverter = function () {
    const accounts = {};
    let map = null;

    const isErrorIndex = function (index, errors) {
        if (errors[index] != null)
            return true;
        return false;
    };

    const convertLine = function (line) {
        const account = map.getAccount(line);

        if (accounts[account] == null)
            accounts[account] = new AccountData(account);

        const dataRow = [
            map.getDate(line),
            map.getPayee(line),
            map.getCategory(line),
            map.getMemo(line),
            map.getOutflow(line),
            map.getInflow(line)
        ];

        accounts[account].addLine(dataRow);
    };

    this.convert = function (results, parser) {
        if (!map) {
            map = BankMapping.recognizeBank(results.meta.fields);
            toastr.info("Bank recognized as " + map.getBank());
        }

        for (let index = 0, line; line = results.data[index]; ++index) {
            if (isErrorIndex(index, results.errors))
                continue;

            convertLine(line);
        }
    };

    this.errorHandle = function (error, file) {
        toast.error("An error occured in file " + file + ": " + error);
    };

    this.complete = function (results) {
        let keys = Object.keys(accounts);
        for (let index = 0, account; account = accounts[keys[index]]; ++index) {
            account.downloadCSV();
        }
    };
};
