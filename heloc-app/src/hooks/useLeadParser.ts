export interface ParsedLead {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    propertyValue?: number;
    currentBalance?: number;
    creditScore?: string;
    cashOut?: number;
    helocBalance?: number;
    loanAmount?: number;
    propertyUse?: string;
    campaign?: string;
}

export const useLeadParser = () => {
    const parseLeadEmail = (emailBody: string): ParsedLead => {
        const parsed: Record<string, string> = {};
        const patterns: { [key: string]: RegExp } = {
            firstName: /First Name\s*[=:]\s*([^.\n]+)/i,
            lastName: /Last Name\s*[=:]\s*([^.\n]+)/i,
            phone: /Phone\s*[=:]\s*([^.\n]+)/i,
            email: /Email\s*[=:]\s*([^\s\n]+@[^\s\n]+)/i,
            address: /^Address\s*[=:]\s*([^.\n]+)/im,
            physAddress: /PhysicalAddress\s*[=:]\s*([^.\n]+)/i,
            city: /^City\s*[=:]\s*([^.\n]+)/im,
            physCity: /Phys City\s*[=:]\s*([^.\n]+)/i,
            state: /^State\s*[=:]\s*([^.\n]+)/im,
            physState: /Phys State\s*[=:]\s*([^.\n]+)/i,
            zip: /^Zip\s*[=:]\s*([^.\n]+)/im,
            physZip: /Phys Zip\s*[=:]\s*([^.\n_]+)/i,
            propertyValue: /Property Value\s*[=:]\s*\$?([\d,.]+)/i,
            currentBalance: /Current Balance\s*[=:]\s*\$?([\d,.]+)/i,
            creditScore: /Credit Rating\s*[=:]\s*(\d+)/i,
            cashOut: /Cash out\s*[=:]\s*\$?([\d,.]+)/i,
            helocBalance: /^HELOC\s*[=:]\s*\$?([\d,.]+)/im,
            loanAmount: /Loan Amount\s*[=:]\s*\$?([\d,.]+)/i,
            propertyUse: /Property Use\s*[=:]\s*([^.\n]+)/i,
            campaign: /Campaign\s*[=:]\s*([^.\n]+)/i
        };

        for (const key in patterns) {
            const match = emailBody.match(patterns[key]);
            if (match && match[1] && match[1].trim()) {
                parsed[key] = match[1].trim().replace(/,/g, '');
            }
        }

        // Process logic similar to original function
        const result: ParsedLead = {};
        if (parsed.firstName) result.firstName = parsed.firstName;
        if (parsed.lastName) result.lastName = parsed.lastName;
        if (parsed.phone) result.phone = parsed.phone;
        if (parsed.email) result.email = parsed.email;

        // Address logic
        const usePhys = parsed.physCity || parsed.physState;
        result.address = usePhys ? (parsed.physAddress || parsed.address) : parsed.address;
        result.city = usePhys ? parsed.physCity : parsed.city;
        result.state = usePhys ? parsed.physState : parsed.state;
        result.zip = usePhys ? parsed.physZip : parsed.zip;
        // Combine full address string? The hook returns parts, UI can combine.

        if (parsed.propertyValue) result.propertyValue = parseFloat(parsed.propertyValue);
        if (parsed.currentBalance) result.currentBalance = parseFloat(parsed.currentBalance);
        if (parsed.creditScore) result.creditScore = parsed.creditScore;
        if (parsed.helocBalance) result.helocBalance = parseFloat(parsed.helocBalance);
        if (parsed.campaign) result.campaign = parsed.campaign;
        if (parsed.propertyUse) result.propertyUse = parsed.propertyUse;

        // Cash out logic from original
        if (parsed.cashOut && parseFloat(parsed.cashOut) > 0) {
            result.cashOut = parseFloat(parsed.cashOut);
        } else if (parsed.loanAmount && parseFloat(parsed.loanAmount) > 0 && parsed.helocBalance) {
            const loanAmt = parseFloat(parsed.loanAmount);
            const helocAmt = parseFloat(parsed.helocBalance);
            // Original logic: if diff < 100, cashOut is 0
            if (Math.abs(loanAmt - helocAmt) < 100) {
                result.cashOut = 0;
            } else {
                result.cashOut = loanAmt - helocAmt;
            }
        }

        return result;
    };

    return { parseLeadEmail };
};
