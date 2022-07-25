
export class Attribute {
    invert = false;
    tempMax = null;
    min = null;
    max = null;

    name;
    value;

    constructor(name, value, {min = null, max = null, invert = false, tempMax = null}) {
        this.name = name;
        this.value = value;
        this.min = min;
        this.max = max;
        this.invert = invert;
        this.tempMax = tempMax;
    }
}

export class SystemConfig {
    name;

    attributes = new Map();

    constructor(name) {
        this.name = name;
    }

    addAttribute(attribute) {
        this.attributes.set(attribute.name, attribute);
        return this;
    }

    addAttributes(attrs) {
        for(attr of attrs) {
            this.addAttribute(attr);
        }
    }
}
